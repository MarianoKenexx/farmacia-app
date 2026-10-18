import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

// Cliente admin con service_role_key (lee todo, no depende de permisos del que cerró la caja)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
  transferencia: 'Transferencia', qr: 'QR / Billetera virtual',
}

// Se llama justo después de cerrar una caja (desde /caja). No bloquea el
// cierre si falla: si no hay mail cargado, no está activado, o no está la
// clave de Resend configurada todavía, simplemente no manda nada.
export async function POST(request: NextRequest) {
  try {
    const { registerId } = await request.json()
    if (!registerId) return NextResponse.json({ ok: false, reason: 'sin registerId' })

    // Confirmamos que quien llama está logueado (no cualquiera desde afuera)
    const cookieStore = await cookies()
    const supaAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supaAuth.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, reason: 'no autenticado' }, { status: 401 })

    const admin = getSupabaseAdmin()

    const { data: settings } = await admin.from('app_settings').select('*').eq('id', 1).maybeSingle()
    if (!settings?.notify_on_close || !settings?.owner_email) {
      return NextResponse.json({ ok: true, skipped: 'sin mail configurado o desactivado' })
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ ok: true, skipped: 'falta RESEND_API_KEY' })
    }

    const { data: reg } = await admin.from('cash_registers').select('*').eq('id', registerId).maybeSingle()
    if (!reg || reg.status !== 'closed') {
      return NextResponse.json({ ok: false, reason: 'caja no encontrada o no cerrada' })
    }

    const { data: sales } = await admin
      .from('sales')
      .select('total, payment_method, status, void_reason, invoice_number')
      .eq('register_id', registerId)

    const completadas = (sales ?? []).filter(s => s.status === 'completed')
    const anuladas = (sales ?? []).filter(s => s.status === 'voided')

    const totalVentas = completadas.reduce((s, v) => s + Number(v.total), 0)
    const porMetodo = completadas.reduce((acc, v) => {
      acc[v.payment_method] = (acc[v.payment_method] || 0) + Number(v.total)
      return acc
    }, {} as Record<string, number>)
    const efectivo = porMetodo['efectivo'] || 0
    const esperado = Number(reg.opening_amount || 0) + efectivo
    const contado = Number(reg.closing_amount || 0)
    const diff = contado - esperado

    let quien = ''
    if (reg.closed_by) {
      const { data: p } = await admin.from('profiles').select('name').eq('id', reg.closed_by).maybeSingle()
      quien = p?.name ?? ''
    }

    const estadoCaja = Math.abs(diff) < 1
      ? '✅ Cuadró justo'
      : diff > 0
        ? `🟡 Sobrante de ${money(diff)}`
        : `🔴 Faltante de ${money(Math.abs(diff))}`

    const nombreNegocio = settings.business_name || 'Farmacia'
    const fecha = new Date(reg.closed_at ?? Date.now()).toLocaleString('es-AR')

    const filasMetodo = Object.entries(porMetodo)
      .map(([m, total]) => `<tr><td style="padding:4px 0;color:#555">${METODO_LABEL[m] || m}</td><td style="padding:4px 0;text-align:right;font-weight:600">${money(total)}</td></tr>`)
      .join('')

    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <h2 style="margin:0 0 4px">${nombreNegocio} — Cierre de caja</h2>
        <p style="color:#777;margin:0 0 20px;font-size:14px">${fecha}${quien ? ` · Cerró ${quien}` : ''}</p>

        <div style="background:${Math.abs(diff) < 1 ? '#ecfdf5' : diff > 0 ? '#fffbeb' : '#fef2f2'};border-radius:10px;padding:14px 16px;margin-bottom:20px">
          <p style="margin:0;font-weight:700;font-size:16px">${estadoCaja}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#555">Esperado ${money(esperado)} · Contado ${money(contado)}</p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
          <tr><td style="padding:4px 0;color:#555">Monto inicial</td><td style="padding:4px 0;text-align:right">${money(Number(reg.opening_amount || 0))}</td></tr>
          <tr><td style="padding:4px 0;color:#555">Ventas totales</td><td style="padding:4px 0;text-align:right;font-weight:700">${money(totalVentas)}</td></tr>
          ${filasMetodo}
        </table>

        <p style="font-size:14px;margin:0 0 4px"><strong>${completadas.length}</strong> venta${completadas.length === 1 ? '' : 's'} registrada${completadas.length === 1 ? '' : 's'}</p>
        ${anuladas.length > 0
          ? `<p style="font-size:14px;color:#dc2626;margin:0 0 4px">⚠️ ${anuladas.length} venta${anuladas.length === 1 ? '' : 's'} anulada${anuladas.length === 1 ? '' : 's'}: ${anuladas.map(a => `#${a.invoice_number}`).join(', ')}</p>`
          : ''}

        <p style="font-size:12px;color:#999;margin-top:24px">Mensaje automático de ${nombreNegocio}. Para desactivarlo, entrá a Configuración.</p>
      </div>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${nombreNegocio} <onboarding@resend.dev>`,
        to: [settings.owner_email],
        subject: `Cierre de caja — ${estadoCaja.replace(/^\S+\s/, '')}`,
        html,
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('notify-cierre', e)
    return NextResponse.json({ ok: false, reason: 'error interno' })
  }
}
