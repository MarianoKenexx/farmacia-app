'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { TrendingUp, Package, Calendar, BarChart2 } from 'lucide-react'

interface TopProduct {
  product_id: string
  name: string
  laboratory: string | null
  qty: number
  revenue: number
}

export default function ReportesPage() {
  const [topHoy, setTopHoy] = useState<TopProduct[]>([])
  const [topTotal, setTopTotal] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  useEffect(() => {
    const load = async () => {
      const hoyInicio = new Date()
      hoyInicio.setHours(0, 0, 0, 0)

      // Ventas de hoy
      const { data: salesHoy } = await supabase
        .from('sales')
        .select('id')
        .eq('status', 'completed')
        .gte('created_at', hoyInicio.toISOString())

      const idsHoy = salesHoy?.map(s => s.id) ?? []

      if (idsHoy.length > 0) {
        const { data: itemsHoy } = await supabase
          .from('sale_items')
          .select('product_id, quantity, subtotal, products(name, laboratory)')
          .in('sale_id', idsHoy)

        const agg: Record<string, TopProduct> = {}
        for (const item of itemsHoy ?? []) {
          const pid = item.product_id
          const prod = item.products as unknown as { name: string; laboratory: string | null } | null
          if (!agg[pid]) agg[pid] = { product_id: pid, name: prod?.name ?? '?', laboratory: prod?.laboratory ?? null, qty: 0, revenue: 0 }
          agg[pid].qty += item.quantity
          agg[pid].revenue += Number(item.subtotal)
        }
        setTopHoy(Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, 10))
      }

      // Todos los tiempos
      const { data: allItems } = await supabase
        .from('sale_items')
        .select('product_id, quantity, subtotal, products(name, laboratory)')

      const aggAll: Record<string, TopProduct> = {}
      for (const item of allItems ?? []) {
        const pid = item.product_id
        const prod = item.products as unknown as { name: string; laboratory: string | null } | null
        if (!aggAll[pid]) aggAll[pid] = { product_id: pid, name: prod?.name ?? '?', laboratory: prod?.laboratory ?? null, qty: 0, revenue: 0 }
        aggAll[pid].qty += item.quantity
        aggAll[pid].revenue += Number(item.subtotal)
      }
      setTopTotal(Object.values(aggAll).sort((a, b) => b.qty - a.qty).slice(0, 10))

      setLoading(false)
    }
    load()
  }, [])

  const TopTable = ({ data, emptyMsg }: { data: TopProduct[]; emptyMsg: string }) => (
    data.length === 0 ? (
      <div className="py-10 text-center text-slate-500 text-sm">{emptyMsg}</div>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Producto</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Unidades</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recaudado</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p, i) => (
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
              <td className="px-4 py-3 text-right">
                <span className="font-semibold text-white">{p.qty}</span>
                <span className="text-slate-500 text-xs ml-1">u.</span>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(p.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-amber-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
        </div>
        <p className="text-slate-400 ml-5">Productos más vendidos</p>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Calculando...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Hoy */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
              <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Calendar className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">Más vendidos hoy</h2>
                <p className="text-xs text-slate-500">
                  {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>
            <TopTable data={topHoy} emptyMsg="Sin ventas hoy todavía" />
          </div>

          {/* Histórico */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
              <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">Más vendidos histórico</h2>
                <p className="text-xs text-slate-500">Todos los tiempos</p>
              </div>
            </div>
            <TopTable data={topTotal} emptyMsg="Sin ventas registradas" />
          </div>
        </div>
      )}
    </div>
  )
}
