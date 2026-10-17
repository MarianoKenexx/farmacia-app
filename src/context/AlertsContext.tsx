'use client'
// Escucha en vivo las alertas nuevas (solo administradores), lleva la cuenta
// de no leídas y muestra un aviso del sistema en la computadora o el celular.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Alert } from '@/types'

interface AlertsContextType {
  unread: number
  refresh: () => Promise<void>
  latest: Alert | null
  dismissLatest: () => void
}

const AlertsContext = createContext<AlertsContextType>({
  unread: 0,
  refresh: async () => {},
  latest: null,
  dismissLatest: () => {},
})

async function showSystemNotification(a: Alert) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const opts: NotificationOptions = {
      body: a.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: a.id,
      data: { url: '/alertas' },
    }
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(a.title, opts)
    else new Notification(a.title, opts)
  } catch {
    /* el dispositivo no permite avisos: queda la alerta dentro de la app */
  }
}

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  const [unread, setUnread] = useState(0)
  const [latest, setLatest] = useState<Alert | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (!isAdmin) { setUnread(0); return }
    const { count } = await supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    setUnread(count ?? 0)
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    refresh()

    const channel = supabase
      .channel('alerts-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, payload => {
        if (!active) return
        const a = payload.new as Alert
        setUnread(n => n + 1)
        setLatest(a)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setLatest(null), 10000)
        showSystemNotification(a)
      })
      .subscribe()

    // Por si se perdió algo mientras la app estaba en segundo plano
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [isAdmin, refresh])

  return (
    <AlertsContext.Provider value={{ unread, refresh, latest, dismissLatest: () => setLatest(null) }}>
      {children}
    </AlertsContext.Provider>
  )
}

export const useAlerts = () => useContext(AlertsContext)
