'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronDown, ChevronRight, History } from 'lucide-react'

interface Register {
  id: string
  opening_amount: number
  closing_amount: number | null
  opened_at: string
  closed_at: string | null
  status: string
}

interface Sale {
  id: string
  total: number
  subtotal: number
  tax: number
  payment_method: string
  invoice_number: string
  created_at: string
}

const metodoLabel: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
  transferencia: 'Transferencia', qr: 'QR',
}

export default function HistorialPage() {
  const [registers, setRegisters] = useState<Register[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [salesMap, setSalesMap] = useState<Record<string, Sale[]>>({})
  const [loading, setLoading] = useState(true)

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  useEffect(() => {
    supabase
      .from('cash_registers')
      .select('*')
      .order('opened_at', { ascending: false })
      .then(({ data }) => {
        setRegisters(data ?? [])
        setLoading(false)
      })
  }, [])

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!salesMap[id]) {
      const { data } = await supabase
        .from('sales')
        .select('*')
        .eq('register_id', id)
        .eq('status', 'completed')
        .order('created_at')
      setSalesMap(m => ({ ...m, [id]: data ?? [] }))
    }
  }

  const totalSales = (sales: Sale[]) => sales.reduce((s, v) => s + Number(v.total), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-blue-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white">Historial de Cajas</h1>
        </div>
        <p className="text-slate-400 ml-5">Registro de todas las sesiones de caja</p>
      </div>

      {loading ? (
        <div className="text-slate-500 text-center py-12">Cargando...</div>
      ) : registers.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay cajas registradas todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map(reg => {
            const isOpen = reg.status === 'open'
            const sales = salesMap[reg.id] ?? []
            const isExpanded = expanded === reg.id
            const total = totalSales(sales)
            const fecha = new Date(reg.opened_at)
            const variance = reg.closing_amount !== null
              ? reg.closing_amount - (reg.opening_amount + (sales.filter(s => s.payment_method === 'efectivo').reduce((a, b) => a + Number(b.total), 0)))
              : null

            return (
              <div key={reg.id} className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => toggle(reg.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-700/50 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  }

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-white text-sm">
                        {fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      {isOpen && (
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          Abierta
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      {reg.closed_at && ` → ${new Date(reg.closed_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-400">{fmt(total)}</p>
                    <p className="text-xs text-slate-500">{isExpanded ? (sales.length) : '...'} ventas</p>
                  </div>

                  <div className="text-right shrink-0 w-24">
                    <p className="text-xs text-slate-400">Inicio: {fmt(reg.opening_amount)}</p>
                    {reg.closing_amount !== null && (
                      <p className="text-xs text-slate-400">Cierre: {fmt(reg.closing_amount)}</p>
                    )}
                  </div>

                  {variance !== null && (
                    <div className={`shrink-0 text-xs font-medium px-2 py-1 rounded-lg ${variance >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {variance >= 0 ? '+' : ''}{fmt(variance)}
                    </div>
                  )}
                </button>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="border-t border-slate-700 px-5 py-4">
                    {sales.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-4">Sin ventas en esta caja</p>
                    ) : (
                      <>
                        {/* Resumen por método */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          {Object.entries(
                            sales.reduce((acc, s) => {
                              acc[s.payment_method] = (acc[s.payment_method] || 0) + Number(s.total)
                              return acc
                            }, {} as Record<string, number>)
                          ).map(([method, amount]) => (
                            <div key={method} className="bg-slate-900 rounded-xl p-3">
                              <p className="text-xs text-slate-500 mb-1">{metodoLabel[method] ?? method}</p>
                              <p className="font-semibold text-white text-sm">{fmt(amount)}</p>
                            </div>
                          ))}
                        </div>

                        {/* Tabla de ventas */}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left pb-2 text-xs text-slate-500 font-medium">Factura</th>
                              <th className="text-left pb-2 text-xs text-slate-500 font-medium">Hora</th>
                              <th className="text-left pb-2 text-xs text-slate-500 font-medium">Pago</th>
                              <th className="text-right pb-2 text-xs text-slate-500 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sales.map(s => (
                              <tr key={s.id} className="border-b border-slate-700/50 last:border-0">
                                <td className="py-2 text-slate-300">#{s.invoice_number}</td>
                                <td className="py-2 text-slate-400">
                                  {new Date(s.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2 text-slate-400">{metodoLabel[s.payment_method] ?? s.payment_method}</td>
                                <td className="py-2 text-right font-semibold text-emerald-400">{fmt(Number(s.total))}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-600">
                              <td colSpan={3} className="pt-3 text-slate-400 font-medium text-xs">TOTAL</td>
                              <td className="pt-3 text-right font-bold text-emerald-400">{fmt(total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
