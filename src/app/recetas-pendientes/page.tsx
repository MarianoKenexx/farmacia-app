'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { HeartPulse, CheckCircle, Send, Clock } from 'lucide-react'

interface Row {
  id: string
  invoice_number: number
  created_at: string
  total: number
  valor_cobertura: number
  estado_reclamo: 'pendiente' | 'presentado' | 'cobrado' | null
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

export default function RecetasPendientesPage() {
  const [filtro, setFiltro] = useState<'todos' | 'pendiente' | 'presentado' | 'cobrado'>('todos')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('sales')
      .select('id, invoice_number, created_at, total, valor_cobertura, estado_reclamo, obras_sociales(nombre)')
      .gt('valor_cobertura', 0)
      .order('created_at', { ascending: false })
    if (filtro !== 'todos') q = q.eq('estado_reclamo', filtro)
    const { data } = await q
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }, [filtro])

  useEffect(() => { load() }, [load])

  async function avanzarEstado(id: string, next: string) {
    setUpdating(id)
    await supabase.rpc('set_estado_reclamo', { p_sale_id: id, p_estado: next })
    setUpdating(null)
    load()
  }

  const totalPendiente = rows.filter(r => r.estado_reclamo !== 'cobrado').reduce((s, r) => s + Number(r.valor_cobertura), 0)

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-emerald-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-emerald-400" /> Recetas pendientes de reclamo
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          Ventas con cobertura de obra social. Lo que falta cobrarle a cada obra social, para hacer
          el seguimiento hasta que llegue la plata.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
                <th className="px-4 py-3 font-medium text-slate-400">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const next = r.estado_reclamo ? ESTADO_NEXT[r.estado_reclamo] : null
                return (
                  <tr key={r.id} className="border-b border-slate-700/60 last:border-0">
                    <td className="px-4 py-3 text-white">#{r.invoice_number}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(r.created_at).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-white">{r.obras_sociales?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{fmt(Number(r.total))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-400">{fmt(Number(r.valor_cobertura))}</td>
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
                    </td>
                    <td className="px-4 py-3 text-right">
                      {next && (
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
    </div>
  )
}
