'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PriceChangeLog } from '@/types'
import { ScrollText, ArrowRight } from 'lucide-react'

const fmt = (n: number | null) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

export default function AuditoriaPreciosPage() {
  const [rows, setRows] = useState<PriceChangeLog[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('price_change_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(500)
    setRows((data ?? []) as PriceChangeLog[])
    const { data: profs } = await supabase.from('profiles').select('id, name')
    setNames(Object.fromEntries((profs ?? []).map(p => [p.id, p.name])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = q.trim()
    ? rows.filter(r => r.product_name.toLowerCase().includes(q.trim().toLowerCase()))
    : rows

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-rose-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-rose-400" /> Auditoría de cambios de precio
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          Cada vez que se cambia el precio de venta o de costo de un producto queda anotado acá,
          automáticamente, quién lo hizo y cuándo. No se puede desactivar ni saltear.
        </p>
      </div>

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar por producto..."
        className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
      />

      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        {loading ? (
          <p className="text-center py-10 text-slate-400">Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <ScrollText className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-400">Sin cambios de precio registrados</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Fecha</th>
                <th className="px-4 py-3 font-medium text-slate-400">Producto</th>
                <th className="px-4 py-3 font-medium text-slate-400">Precio de venta</th>
                <th className="px-4 py-3 font-medium text-slate-400">Precio de costo</th>
                <th className="px-4 py-3 font-medium text-slate-400">Cambió</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const ventaChanged = r.old_sale_price !== r.new_sale_price
                const costoChanged = r.old_purchase_price !== r.new_purchase_price
                return (
                  <tr key={r.id} className="border-b border-slate-700/60 last:border-0">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(r.changed_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-white">{r.product_name}</td>
                    <td className="px-4 py-3">
                      {ventaChanged ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-slate-400">{fmt(r.old_sale_price)}</span>
                          <ArrowRight className="w-3 h-3 text-slate-600" />
                          <span className="font-semibold text-emerald-400">{fmt(r.new_sale_price)}</span>
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {costoChanged ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-slate-400">{fmt(r.old_purchase_price)}</span>
                          <ArrowRight className="w-3 h-3 text-slate-600" />
                          <span className="font-semibold text-amber-400">{fmt(r.new_purchase_price)}</span>
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{r.changed_by ? (names[r.changed_by] ?? '?') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
