'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { inicioPeriodo, PERIODO_LABEL, type Periodo } from '@/lib/roles'
import { METODO_LABEL } from '@/lib/ticket'
import { ChevronDown, ChevronRight, History, Trash2, AlertTriangle } from 'lucide-react'

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
  register_id: string | null
  total: number
  subtotal: number
  tax: number
  payment_method: string
  invoice_number: string
  created_at: string
}

const PERIODOS: Periodo[] = ['hoy', 'semana', 'mes', 'todo']

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

const sumTotal = (sales: Sale[]) => sales.reduce((s, v) => s + Number(v.total), 0)
const sumEfectivo = (sales: Sale[]) =>
  sales.filter(s => s.payment_method === 'efectivo').reduce((s, v) => s + Number(v.total), 0)

export default function HistorialPage() {
  const { profile } = useAuth()
  const canDelete = profile?.role === 'superadmin'

  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [registers, setRegisters] = useState<Register[]>([])
  const [salesByReg, setSalesByReg] = useState<Record<string, Sale[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toDelete, setToDelete] = useState<Register | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const desde = inicioPeriodo(periodo)
    let q = supabase.from('cash_registers').select('*').order('opened_at', { ascending: false })
    if (desde) q = q.gte('opened_at', desde.toISOString())
    const { data: regs } = await q
    const list = (regs ?? []) as Register[]
    setRegisters(list)

    const map: Record<string, Sale[]> = {}
    if (list.length > 0) {
      const { data: sales } = await supabase
        .from('sales')
        .select('id, register_id, total, subtotal, tax, payment_method, invoice_number, created_at')
        .in('register_id', list.map(r => r.id))
        .eq('status', 'completed')
        .order('created_at')
      for (const s of (sales ?? []) as Sale[]) {
        if (!s.register_id) continue
        ;(map[s.register_id] ??= []).push(s)
      }
    }
    setSalesByReg(map)
    setLoading(false)
  }, [periodo])

  useEffect(() => { load() }, [load])

  // Resumen del período
  const resumen = useMemo(() => {
    const all = Object.values(salesByReg).flat()
    const porMetodo: Record<string, number> = {}
    for (const s of all) porMetodo[s.payment_method] = (porMetodo[s.payment_method] || 0) + Number(s.total)
    let diferencia = 0
    for (const r of registers) {
      if (r.closing_amount === null) continue
      diferencia += r.closing_amount - (r.opening_amount + sumEfectivo(salesByReg[r.id] ?? []))
    }
    return { total: sumTotal(all), ventas: all.length, cajas: registers.length, porMetodo, diferencia }
  }, [registers, salesByReg])

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    const res = await fetch('/api/admin/ventas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'register', id: toDelete.id }),
    })
    const json = await res.json().catch(() => ({}))
    setDeleting(false)
    setToDelete(null)
    if (!res.ok) {
      setMsg(json.error ?? 'No se pudo borrar')
    } else {
      setMsg(`Caja borrada (${json.salesDeleted} ventas eliminadas)`)
      load()
    }
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-blue-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white">Historial de Cajas</h1>
        </div>
        <p className="text-slate-400 ml-5">Registro de todas las sesiones de caja</p>
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap gap-2 mb-5">
        {PERIODOS.map(p => (
          <button
            key={p}
            onClick={() => { setPeriodo(p); setExpanded(null) }}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              periodo === p
                ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
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

      {/* Resumen */}
      {!loading && registers.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total vendido</p>
            <p className="text-lg font-bold text-emerald-400">{fmt(resumen.total)}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Ventas</p>
            <p className="text-lg font-bold text-white">{resumen.ventas}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Cajas</p>
            <p className="text-lg font-bold text-white">{resumen.cajas}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Diferencia acumulada</p>
            <p className={`text-lg font-bold ${resumen.diferencia < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {resumen.diferencia >= 0 ? '+' : ''}{fmt(resumen.diferencia)}
            </p>
          </div>
          {Object.keys(resumen.porMetodo).length > 0 && (
            <div className="col-span-2 lg:col-span-4 bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-500 mb-2">Por método de pago</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {Object.entries(resumen.porMetodo).map(([m, v]) => (
                  <div key={m} className="text-sm">
                    <span className="text-slate-400">{METODO_LABEL[m] ?? m}: </span>
                    <span className="font-semibold text-white">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-12">Cargando...</div>
      ) : registers.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay cajas en este período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map(reg => {
            const isOpen = reg.status === 'open'
            const sales = salesByReg[reg.id] ?? []
            const isExpanded = expanded === reg.id
            const total = sumTotal(sales)
            const fecha = new Date(reg.opened_at)
            const esperado = reg.opening_amount + sumEfectivo(sales)
            const variance = reg.closing_amount !== null ? reg.closing_amount - esperado : null

            return (
              <div key={reg.id} className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="flex items-center">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : reg.id)}
                    className="flex-1 flex items-center gap-4 px-5 py-4 hover:bg-slate-700/50 transition-colors text-left min-w-0"
                  >
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    }

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-white text-sm capitalize">
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
                      <p className="text-xs text-slate-500">{sales.length} ventas</p>
                    </div>

                    <div className="text-right shrink-0 w-32 hidden sm:block">
                      <p className="text-xs text-slate-400">Inicio: {fmt(reg.opening_amount)}</p>
                      {reg.closing_amount !== null && (
                        <p className="text-xs text-slate-400">Contado: {fmt(reg.closing_amount)}</p>
                      )}
                    </div>

                    {variance !== null && (
                      <div
                        title="Contado menos esperado en efectivo"
                        className={`shrink-0 text-xs font-medium px-2 py-1 rounded-lg ${
                          Math.abs(variance) < 0.01
                            ? 'bg-slate-700 text-slate-300'
                            : variance > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {variance >= 0 ? '+' : ''}{fmt(variance)}
                      </div>
                    )}
                  </button>

                  {canDelete && !isOpen && (
                    <button
                      onClick={() => setToDelete(reg)}
                      title="Borrar esta caja"
                      className="mx-3 p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700 px-5 py-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
                      <div className="bg-slate-900 rounded-xl p-3">
                        <p className="text-xs text-slate-500 mb-1">Esperado en efectivo</p>
                        <p className="font-semibold text-white">{fmt(esperado)}</p>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-3">
                        <p className="text-xs text-slate-500 mb-1">Contado al cerrar</p>
                        <p className="font-semibold text-white">{reg.closing_amount !== null ? fmt(reg.closing_amount) : '—'}</p>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-3">
                        <p className="text-xs text-slate-500 mb-1">Diferencia</p>
                        <p className={`font-semibold ${variance !== null && variance < 0 ? 'text-red-400' : 'text-white'}`}>
                          {variance !== null ? `${variance >= 0 ? '+' : ''}${fmt(variance)}` : '—'}
                        </p>
                      </div>
                    </div>

                    {sales.length === 0 ? (
                      <p className="text-slate-500 text-sm text-center py-4">Sin ventas en esta caja</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          {Object.entries(
                            sales.reduce((acc, s) => {
                              acc[s.payment_method] = (acc[s.payment_method] || 0) + Number(s.total)
                              return acc
                            }, {} as Record<string, number>)
                          ).map(([method, amount]) => (
                            <div key={method} className="bg-slate-900 rounded-xl p-3">
                              <p className="text-xs text-slate-500 mb-1">{METODO_LABEL[method] ?? method}</p>
                              <p className="font-semibold text-white text-sm">{fmt(amount)}</p>
                            </div>
                          ))}
                        </div>

                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left pb-2 text-xs text-slate-500 font-medium">Ticket</th>
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
                                <td className="py-2 text-slate-400">{METODO_LABEL[s.payment_method] ?? s.payment_method}</td>
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

      {/* Confirmación de borrado */}
      {toDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-white font-semibold">¿Borrar esta caja?</h2>
            </div>
            <p className="text-sm text-slate-400 mb-1">
              Caja del {new Date(toDelete.opened_at).toLocaleString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-sm text-slate-400 mb-5">
              Se borran la caja y sus <b className="text-white">{(salesByReg[toDelete.id] ?? []).length} ventas</b>. No se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-xl"
              >
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
