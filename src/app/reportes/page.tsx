'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { inicioPeriodo, PERIODO_LABEL, type Periodo } from '@/lib/roles'
import { METODO_LABEL } from '@/lib/ticket'
import { TrendingUp, Trash2, AlertTriangle, Receipt, ShoppingCart, Wallet } from 'lucide-react'

interface SaleRow {
  id: string
  total: number
  payment_method: string
  created_at: string
  sale_items: {
    product_id: string
    quantity: number
    subtotal: number
    products: { name: string; laboratory: string | null } | null
  }[]
}

interface TopProduct {
  product_id: string
  name: string
  laboratory: string | null
  qty: number
  revenue: number
}

const PERIODOS: Periodo[] = ['hoy', 'semana', 'mes', 'todo']

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

export default function ReportesPage() {
  const { profile } = useAuth()
  const canDelete = profile?.role === 'superadmin'

  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [sales, setSales] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const desde = inicioPeriodo(periodo)
    let q = supabase
      .from('sales')
      .select('id, total, payment_method, created_at, sale_items(product_id, quantity, subtotal, products(name, laboratory))')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
    if (desde) q = q.gte('created_at', desde.toISOString())
    const { data } = await q
    setSales((data ?? []) as unknown as SaleRow[])
    setLoading(false)
  }, [periodo])

  useEffect(() => { load() }, [load])

  const { top, total, porMetodo } = useMemo(() => {
    const agg: Record<string, TopProduct> = {}
    const porMetodo: Record<string, { monto: number; ventas: number }> = {}
    let total = 0
    for (const s of sales) {
      total += Number(s.total)
      const m = (porMetodo[s.payment_method] ??= { monto: 0, ventas: 0 })
      m.monto += Number(s.total)
      m.ventas += 1
      for (const it of s.sale_items ?? []) {
        const a = (agg[it.product_id] ??= {
          product_id: it.product_id,
          name: it.products?.name ?? '(producto borrado)',
          laboratory: it.products?.laboratory ?? null,
          qty: 0,
          revenue: 0,
        })
        a.qty += Number(it.quantity)
        a.revenue += Number(it.subtotal)
      }
    }
    return {
      top: Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, 15),
      total,
      porMetodo,
    }
  }, [sales])

  async function confirmDelete() {
    setDeleting(true)
    const desde = inicioPeriodo(periodo)
    const res = await fetch('/api/admin/ventas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'sales', from: desde ? desde.toISOString() : null }),
    })
    const json = await res.json().catch(() => ({}))
    setDeleting(false)
    setConfirm(false)
    setMsg(res.ok ? `Se borraron ${json.salesDeleted} ventas` : (json.error ?? 'No se pudo borrar'))
    setTimeout(() => setMsg(''), 4000)
    if (res.ok) load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-6 bg-amber-500 rounded-full" />
            <h1 className="text-2xl font-bold text-white">Reportes</h1>
          </div>
          <p className="text-slate-400 ml-5">Ventas y productos más vendidos</p>
        </div>
        {canDelete && sales.length > 0 && (
          <button
            onClick={() => setConfirm(true)}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl"
          >
            <Trash2 className="w-4 h-4" /> Borrar ventas de “{PERIODO_LABEL[periodo]}”
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {PERIODOS.map(p => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              periodo === p
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {PERIODO_LABEL[p]}
          </button>
        ))}
      </div>

      {msg && (
        <div className="mb-4 text-sm bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-4 py-2.5">{msg}</div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12">Calculando...</div>
      ) : (
        <div className="space-y-6">
          {/* Resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Total vendido</p>
              <p className="text-xl font-bold text-emerald-400">{fmt(total)}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> Ventas</p>
              <p className="text-xl font-bold text-white">{sales.length}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> Ticket promedio</p>
              <p className="text-xl font-bold text-white">{fmt(sales.length ? total / sales.length : 0)}</p>
            </div>
          </div>

          {/* Métodos de pago */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <h2 className="font-semibold text-white text-sm mb-4">Por método de pago</h2>
            {Object.keys(porMetodo).length === 0 ? (
              <p className="text-slate-500 text-sm">Sin ventas en este período</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(porMetodo)
                  .sort((a, b) => b[1].monto - a[1].monto)
                  .map(([m, v]) => {
                    const pct = total > 0 ? (v.monto / total) * 100 : 0
                    return (
                      <div key={m}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-300">{METODO_LABEL[m] ?? m} <span className="text-slate-500">· {v.ventas} ventas</span></span>
                          <span className="font-semibold text-white">{fmt(v.monto)} <span className="text-slate-500 font-normal">({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Más vendidos */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
              <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">Más vendidos</h2>
                <p className="text-xs text-slate-500">{PERIODO_LABEL[periodo]}</p>
              </div>
            </div>
            {top.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">Sin ventas en este período</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Producto</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cajas</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recaudado</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p, i) => (
                    <tr key={p.product_id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors last:border-0">
                      <td className="px-4 py-3">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          i === 1 ? 'bg-slate-400/20 text-slate-300' :
                          i === 2 ? 'bg-amber-600/20 text-amber-500' :
                          'bg-slate-700 text-slate-500'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{p.name}</p>
                        {p.laboratory && <p className="text-xs text-slate-500">{p.laboratory}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{fmtQty(p.qty)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-white font-semibold">¿Borrar {sales.length} ventas?</h2>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              Se borran todas las ventas de <b className="text-white">{PERIODO_LABEL[periodo].toLowerCase()}</b> ({fmt(total)}).
              También desaparecen de los cierres de caja. El stock no se modifica. No se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(false)} disabled={deleting} className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-xl">
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl disabled:opacity-50"
              >
                {deleting ? 'Borrando...' : 'Sí, borrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
