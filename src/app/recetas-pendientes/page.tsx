'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { HeartPulse, CheckCircle, Send, Clock, Printer, AlertTriangle } from 'lucide-react'

interface Row {
  id: string
  invoice_number: number
  created_at: string
  total: number
  valor_cobertura: number
  estado_reclamo: 'pendiente' | 'presentado' | 'cobrado' | null
  estado_reclamo_at: string | null
  estado_reclamo_by: string | null
  monto_cobrado: number | null
  obra_social_id: string | null
  obras_sociales: { nombre: string } | null
}

const ESTADOS = ['pendiente', 'presentado', 'cobrado'] as const
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', presentado: 'Presentado', cobrado: 'Cobrado' }
const ESTADO_NEXT: Record<string, { next: typeof ESTADOS[number]; label: string } | null> = {
  pendiente: { next: 'presentado', label: 'Marcar presentado' },
  presentado: { next: 'cobrado', label: 'Marcar cobrado' },
  cobrado: null,
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
const mesKey = (iso: string) => iso.slice(0, 7) // YYYY-MM

export default function RecetasPendientesPage() {
  const { profile } = useAuth()
  const esDueno = profile?.role === 'superadmin'

  const [filtro, setFiltro] = useState<'todos' | 'pendiente' | 'presentado' | 'cobrado'>('todos')
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const [cobrar, setCobrar] = useState<Row | null>(null)
  const [montoCobrado, setMontoCobrado] = useState('')
  const [cobrarError, setCobrarError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('sales')
      .select('id, invoice_number, created_at, total, valor_cobertura, estado_reclamo, estado_reclamo_at, estado_reclamo_by, monto_cobrado, obra_social_id, obras_sociales(nombre)')
      .gt('valor_cobertura', 0)
      .order('created_at', { ascending: false })
    if (filtro !== 'todos') q = q.eq('estado_reclamo', filtro)
    const { data } = await q
    setRows((data ?? []) as unknown as Row[])
    const { data: profs } = await supabase.from('profiles').select('id, name')
    setNames(Object.fromEntries((profs ?? []).map(p => [p.id, p.name])))
    setLoading(false)
  }, [filtro])

  useEffect(() => { load() }, [load])

  async function avanzarEstado(id: string, next: string) {
    setUpdating(id)
    await supabase.rpc('set_estado_reclamo', { p_sale_id: id, p_estado: next })
    setUpdating(null)
    load()
  }

  async function confirmarCobrado() {
    if (!cobrar) return
    const monto = Number(montoCobrado)
    if (montoCobrado === '' || isNaN(monto) || monto < 0) { setCobrarError('Indicá el monto que realmente te pagó la obra social'); return }
    setUpdating(cobrar.id)
    const { error } = await supabase.rpc('set_estado_reclamo', { p_sale_id: cobrar.id, p_estado: 'cobrado', p_monto_cobrado: monto })
    setUpdating(null)
    if (error) { setCobrarError(error.message); return }
    setCobrar(null)
    setMontoCobrado('')
    load()
  }

  const totalPendiente = rows.filter(r => r.estado_reclamo !== 'cobrado').reduce((s, r) => s + Number(r.valor_cobertura), 0)

  // Resumen mensual por obra social: para cruzar contra lo que informe
  // quien hace el trámite, y detectar si lo cobrado no coincide con lo esperado.
  const resumenMensual = useMemo(() => {
    const map: Record<string, { mes: string; obraSocial: string; esperado: number; cobrado: number; diferencia: number; count: number }> = {}
    for (const r of rows) {
      const mes = mesKey(r.created_at)
      const obraSocial = r.obras_sociales?.nombre ?? '—'
      const key = `${mes}__${obraSocial}`
      const entry = (map[key] ??= { mes, obraSocial, esperado: 0, cobrado: 0, diferencia: 0, count: 0 })
      entry.esperado += Number(r.valor_cobertura)
      entry.count += 1
      if (r.estado_reclamo === 'cobrado' && r.monto_cobrado !== null) {
        entry.cobrado += Number(r.monto_cobrado)
      }
    }
    for (const e of Object.values(map)) e.diferencia = e.cobrado - e.esperado
    return Object.values(map).sort((a, b) => b.mes.localeCompare(a.mes))
  }, [rows])

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-6 bg-emerald-500 rounded-full" />
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-emerald-400" /> Recetas pendientes de reclamo
            </h1>
          </div>
          <p className="text-slate-400 ml-5 text-sm max-w-2xl">
            Ventas con cobertura de obra social. Esto es el “papel” contra el cual comparar lo que te
            informe mensualmente quien hace el trámite de entrega y cobro: queda anotado quién marcó
            cada cambio, cuándo, y el monto que realmente se cobró.
          </p>
        </div>
        {rows.length > 0 && (
          <button onClick={() => window.print()} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl shrink-0">
            <Printer className="w-4 h-4" /> Exportar PDF
          </button>
        )}
      </div>

      <div className="print-only" style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Recetas pendientes de reclamo</h1>
        <p style={{ fontSize: '12px', color: '#555' }}>Impreso: {new Date().toLocaleString('es-AR')}</p>
        <hr style={{ margin: '10px 0' }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex gap-2">
          {(['todos', 'pendiente', 'presentado', 'cobrado'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border ${
                filtro === f
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              {f === 'todos' ? 'Todos' : ESTADO_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm">
          <span className="text-slate-400">Total sin cobrar: </span>
          <span className="text-emerald-400 font-bold">{fmt(totalPendiente)}</span>
        </div>
      </div>

      {/* Resumen mensual por obra social, para el cierre/auditoría de fin de mes */}
      {resumenMensual.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700">
            <h2 className="font-semibold text-white text-sm">Resumen por mes y obra social</h2>
            <p className="text-xs text-slate-500">
              “Diferencia” compara lo cobrado (lo que vos cargaste como realmente recibido) contra lo que la app esperaba. Si da negativo, falta plata por justificar.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-2 font-medium text-slate-400">Mes</th>
                <th className="px-4 py-2 font-medium text-slate-400">Obra social</th>
                <th className="px-4 py-2 font-medium text-slate-400 text-right">Recetas</th>
                <th className="px-4 py-2 font-medium text-slate-400 text-right">Esperado</th>
                <th className="px-4 py-2 font-medium text-slate-400 text-right">Cobrado</th>
                <th className="px-4 py-2 font-medium text-slate-400 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {resumenMensual.map(r => (
                <tr key={`${r.mes}__${r.obraSocial}`} className="border-b border-slate-700/60 last:border-0">
                  <td className="px-4 py-2 text-slate-300">{r.mes}</td>
                  <td className="px-4 py-2 text-white">{r.obraSocial}</td>
                  <td className="px-4 py-2 text-right text-slate-400">{r.count}</td>
                  <td className="px-4 py-2 text-right text-amber-400">{fmt(r.esperado)}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{fmt(r.cobrado)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${Math.abs(r.diferencia) < 1 ? 'text-slate-400' : r.diferencia < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {r.diferencia >= 0 ? '+' : ''}{fmt(r.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        {loading ? (
          <p className="text-center py-10 text-slate-400">Cargando...</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <HeartPulse className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-slate-400">No hay recetas con cobertura en este filtro</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Ticket</th>
                <th className="px-4 py-3 font-medium text-slate-400">Fecha</th>
                <th className="px-4 py-3 font-medium text-slate-400">Obra social</th>
                <th className="px-4 py-3 font-medium text-slate-400 text-right">Cliente pagó</th>
                <th className="px-4 py-3 font-medium text-slate-400 text-right">A reclamar</th>
                <th className="px-4 py-3 font-medium text-slate-400 text-right">Cobrado real</th>
                <th className="px-4 py-3 font-medium text-slate-400">Estado</th>
                <th className="px-4 py-3 no-print"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const next = r.estado_reclamo ? ESTADO_NEXT[r.estado_reclamo] : null
                const discrepancia = r.estado_reclamo === 'cobrado' && r.monto_cobrado !== null
                  ? Number(r.monto_cobrado) - Number(r.valor_cobertura) : null
                return (
                  <tr key={r.id} className="border-b border-slate-700/60 last:border-0">
                    <td className="px-4 py-3 text-white">#{r.invoice_number}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(r.created_at).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-white">{r.obras_sociales?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{fmt(Number(r.total))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-400">{fmt(Number(r.valor_cobertura))}</td>
                    <td className="px-4 py-3 text-right">
                      {r.monto_cobrado !== null ? (
                        <span className={discrepancia !== null && Math.abs(discrepancia) >= 1 ? 'font-semibold text-red-400' : 'text-emerald-400'}>
                          {fmt(Number(r.monto_cobrado))}
                          {discrepancia !== null && Math.abs(discrepancia) >= 1 && (
                            <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 w-fit ${
                        r.estado_reclamo === 'cobrado' ? 'bg-emerald-500/10 text-emerald-400'
                        : r.estado_reclamo === 'presentado' ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {r.estado_reclamo === 'cobrado' ? <CheckCircle className="w-3 h-3" />
                          : r.estado_reclamo === 'presentado' ? <Send className="w-3 h-3" />
                          : <Clock className="w-3 h-3" />}
                        {ESTADO_LABEL[r.estado_reclamo ?? 'pendiente']}
                      </span>
                      {r.estado_reclamo_by && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {names[r.estado_reclamo_by] ?? '?'}{r.estado_reclamo_at && ` · ${new Date(r.estado_reclamo_at).toLocaleDateString('es-AR')}`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right no-print">
                      {next && next.next === 'cobrado' && (
                        esDueno ? (
                          <button
                            onClick={() => { setCobrar(r); setMontoCobrado(String(r.valor_cobertura)); setCobrarError('') }}
                            disabled={updating === r.id}
                            className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            Marcar cobrado
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500" title="Solo el dueño puede confirmar el cobro final">Esperando al dueño</span>
                        )
                      )}
                      {next && next.next !== 'cobrado' && (
                        <button
                          onClick={() => avanzarEstado(r.id, next.next)}
                          disabled={updating === r.id}
                          className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          {updating === r.id ? 'Guardando...' : next.label}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirmar monto cobrado */}
      {cobrar && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <h2 className="text-white font-semibold mb-1">Confirmar cobro — venta #{cobrar.invoice_number}</h2>
            <p className="text-sm text-slate-400 mb-4">
              La app esperaba <b className="text-amber-400">{fmt(Number(cobrar.valor_cobertura))}</b> de {cobrar.obras_sociales?.nombre ?? 'la obra social'}.
              Poné el monto que realmente te pagaron (según lo que te informe quien hizo el trámite). Si no coincide, va a quedar marcado para que lo revises.
            </p>
            <input
              autoFocus
              type="number"
              value={montoCobrado}
              onChange={e => setMontoCobrado(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm mb-2"
            />
            {cobrarError && <p className="text-sm text-red-400 mb-2">{cobrarError}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setCobrar(null)} className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-xl">Cancelar</button>
              <button onClick={confirmarCobrado} disabled={updating === cobrar.id} className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl disabled:opacity-50">
                {updating === cobrar.id ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
