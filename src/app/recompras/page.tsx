'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Phone, Clock, AlertTriangle } from 'lucide-react'

interface Row {
  customer_id: string
  customer_name: string
  customer_phone: string | null
  product_id: string
  product_name: string
  last_purchase: string
  dias_tratamiento: number
}

const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR')
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

export default function RecomprasPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Traemos ventas de los últimos 6 meses con cliente identificado y productos
    // que tengan "días de tratamiento" cargados — con eso alcanza para cubrir
    // cualquier tratamiento razonable sin traer todo el historial.
    const desde = new Date()
    desde.setMonth(desde.getMonth() - 6)
    const { data } = await supabase
      .from('sale_items')
      .select('quantity, sales!inner(customer_id, created_at, status, customers(id, name, phone)), products!inner(id, name, dias_tratamiento)')
      .eq('sales.status', 'completed')
      .not('sales.customer_id', 'is', null)
      .not('products.dias_tratamiento', 'is', null)
      .gte('sales.created_at', desde.toISOString())

    // Nos quedamos con la compra MÁS RECIENTE por cliente+producto.
    type Raw = { sales: { customer_id: string; created_at: string; customers: { id: string; name: string; phone: string | null } | null }; products: { id: string; name: string; dias_tratamiento: number } }
    const map: Record<string, Row> = {}
    for (const r of (data ?? []) as unknown as Raw[]) {
      const sale = r.sales
      const prod = r.products
      if (!sale?.customers || !prod) continue
      const key = `${sale.customer_id}__${prod.id}`
      const existing = map[key]
      if (!existing || new Date(sale.created_at) > new Date(existing.last_purchase)) {
        map[key] = {
          customer_id: sale.customer_id,
          customer_name: sale.customers.name,
          customer_phone: sale.customers.phone,
          product_id: prod.id,
          product_name: prod.name,
          last_purchase: sale.created_at,
          dias_tratamiento: prod.dias_tratamiento,
        }
      }
    }
    setRows(Object.values(map))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const clasificadas = useMemo(() => {
    const out = rows.map(r => {
      const diasPasados = diasDesde(r.last_purchase)
      const diasRestantes = r.dias_tratamiento - diasPasados
      return { ...r, diasRestantes }
    })
    // Solo mostramos lo relevante: vencido hace poco (hasta 30 días) o por vencer en los próximos 7.
    return out
      .filter(r => r.diasRestantes <= 7 && r.diasRestantes >= -30)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
  }, [rows])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-sky-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-sky-400" /> Recompras
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm max-w-2xl">
          Clientes a los que se les debería estar terminando un tratamiento (según los &quot;días de
          tratamiento&quot; cargados en el producto) y todavía no volvieron a comprarlo. Es una lista para
          llamar o escribirle — la app no manda avisos solos todavía.
        </p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        {loading ? (
          <p className="text-center py-10 text-slate-400">Cargando...</p>
        ) : clasificadas.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-400">No hay recompras próximas por ahora</p>
            <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
              Para que aparezca algo acá, el producto necesita tener cargados los &quot;días de
              tratamiento&quot; (en Productos) y la venta tiene que haberse hecho con un cliente elegido en el POS.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Cliente</th>
                <th className="px-4 py-3 font-medium text-slate-400">Producto</th>
                <th className="px-4 py-3 font-medium text-slate-400">Última compra</th>
                <th className="px-4 py-3 font-medium text-slate-400">Estado</th>
              </tr>
            </thead>
            <tbody>
              {clasificadas.map(r => (
                <tr key={`${r.customer_id}__${r.product_id}`} className="border-b border-slate-700/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{r.customer_name}</p>
                    {r.customer_phone && (
                      <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" /> {r.customer_phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.product_name}</td>
                  <td className="px-4 py-3 text-slate-400">{fmtFecha(r.last_purchase)}</td>
                  <td className="px-4 py-3">
                    {r.diasRestantes < 0 ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-500/10 text-red-400 flex items-center gap-1 w-fit">
                        <AlertTriangle className="w-3 h-3" /> Venció hace {Math.abs(r.diasRestantes)} días
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-500/10 text-amber-400 flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" /> {r.diasRestantes === 0 ? 'Vence hoy' : `Vence en ${r.diasRestantes} días`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
