import { NextResponse, type NextRequest } from 'next/server'
import { getCallerRole, getSupabaseAdmin } from '@/lib/server-admin'

// DELETE — borrar registros de ventas / cajas. Solo superadmin.
//
// Body JSON:
//   { scope: 'register', id: '<uuid>' }        → borra esa caja (cerrada) y sus ventas
//   { scope: 'sales', from: '<ISO>' | null }   → borra las ventas desde esa fecha (null = todas)
//
// Las líneas de cada venta (sale_items) se borran solas junto con la venta.
export async function DELETE(request: NextRequest) {
  const role = await getCallerRole()
  if (role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let body: { scope?: string; id?: string; from?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  if (body.scope === 'register') {
    if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const { data: reg, error: regErr } = await db
      .from('cash_registers')
      .select('id, status')
      .eq('id', body.id)
      .single()
    if (regErr || !reg) return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
    if (reg.status === 'open') {
      return NextResponse.json({ error: 'No se puede borrar una caja abierta. Cerrala primero.' }, { status: 400 })
    }

    const { count: salesDeleted, error: sErr } = await db
      .from('sales')
      .delete({ count: 'exact' })
      .eq('register_id', body.id)
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

    const { error: rErr } = await db.from('cash_registers').delete().eq('id', body.id)
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, salesDeleted: salesDeleted ?? 0 })
  }

  if (body.scope === 'sales') {
    let q = db.from('sales').delete({ count: 'exact' })
    if (body.from) {
      const d = new Date(body.from)
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
      q = q.gte('created_at', d.toISOString())
    } else {
      q = q.not('id', 'is', null)
    }
    const { count, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, salesDeleted: count ?? 0 })
  }

  return NextResponse.json({ error: 'Tipo de borrado desconocido' }, { status: 400 })
}
