'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAlerts } from '@/context/AlertsContext'
import type { Alert } from '@/types'
import { Bell, BellRing, CheckCheck, AlertTriangle, PackageX, Ban, TrendingUp, Package, LockOpen } from 'lucide-react'

const ICON: Record<string, typeof Bell> = {
  faltante: AlertTriangle,
  sobrante: TrendingUp,
  sin_stock: PackageX,
  stock_bajo: Package,
  venta_anulada: Ban,
  apertura_no_coincide: LockOpen,
}

const TONE: Record<string, string> = {
  alta: 'bg-red-500/10 text-red-400',
  media: 'bg-amber-500/10 text-amber-400',
  info: 'bg-slate-700 text-slate-300',
}

type Filtro = 'nuevas' | 'todas'

export default function AlertasPage() {
  const { refresh } = useAlerts()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [filtro, setFiltro] = useState<Filtro>('nuevas')
  const [loading, setLoading] = useState(true)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(200)
    if (filtro === 'nuevas') q = q.is('read_at', null)
    const { data } = await q
    setAlerts((data ?? []) as Alert[])
    setLoading(false)
  }, [filtro])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
    // Recargar si llega una alerta nueva mientras miramos esta pantalla
    const ch = supabase
      .channel('alerts-page')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration()
      reg?.showNotification('Avisos activados', {
        body: 'Vas a recibir aquí las alertas de la farmacia.',
        icon: '/icon-192.png',
      })
    }
  }

  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    await supabase.from('alerts').update({ read_at: new Date().toISOString() }).in('id', ids)
    await refresh()
    load()
  }

  const unreadIds = alerts.filter(a => !a.read_at).map(a => a.id)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-6 bg-red-500 rounded-full" />
            <h1 className="text-2xl font-bold text-white">Alertas</h1>
          </div>
          <p className="text-slate-400 ml-5 text-sm">Faltantes de caja, stock y ventas anuladas</p>
        </div>
        {unreadIds.length > 0 && (
          <button
            onClick={() => markRead(unreadIds)}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl shrink-0"
          >
            <CheckCheck className="w-4 h-4" /> Marcar todas como vistas
          </button>
        )}
      </div>

      {/* Avisos en este dispositivo */}
      {perm !== 'granted' && (
        <div className="mb-5 bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BellRing className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm text-white font-medium">Recibir avisos en este dispositivo</p>
              <p className="text-xs text-slate-400">
                {perm === 'denied'
                  ? 'Los avisos están bloqueados. Habilitalos desde el candadito de la barra de direcciones.'
                  : perm === 'unsupported'
                    ? 'Este navegador no permite avisos. En iPhone, instalá la app en la pantalla de inicio.'
                    : 'Te avisa apenas pasa algo, mientras la app esté abierta (aunque esté minimizada).'}
              </p>
            </div>
          </div>
          {perm === 'default' && (
            <button onClick={enableNotifications} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shrink-0">
              Activar
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['nuevas', 'todas'] as Filtro[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border ${
              filtro === f ? 'bg-red-500/10 border-red-500/40 text-red-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'nuevas' ? 'Sin ver' : 'Todas'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-slate-500 py-12">Cargando...</p>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filtro === 'nuevas' ? 'No hay alertas nuevas' : 'Todavía no hubo alertas'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => {
            const Icon = ICON[a.type] ?? Bell
            return (
              <div
                key={a.id}
                className={`flex items-start gap-3 bg-slate-800 border rounded-2xl p-4 ${a.read_at ? 'border-slate-700/60 opacity-70' : 'border-slate-600'}`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TONE[a.severity] ?? TONE.info}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{a.title}</p>
                  {a.body && <p className="text-sm text-slate-400">{a.body}</p>}
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(a.created_at).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {!a.read_at && (
                  <button onClick={() => markRead([a.id])} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-700 shrink-0">
                    Vista
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
