'use client'
import Link from 'next/link'
import { Bell, X } from 'lucide-react'
import { useAlerts } from '@/context/AlertsContext'

const color: Record<string, string> = {
  alta: 'border-red-500/50 bg-red-950/90',
  media: 'border-amber-500/50 bg-amber-950/90',
  info: 'border-slate-600 bg-slate-900/95',
}

// Cartelito que aparece abajo a la derecha cuando llega una alerta nueva
export function AlertToast() {
  const { latest, dismissLatest } = useAlerts()
  if (!latest) return null
  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)] border rounded-2xl p-4 shadow-2xl ${color[latest.severity] ?? color.info}`}>
      <div className="flex items-start gap-3">
        <Bell className="w-5 h-5 text-white shrink-0 mt-0.5" />
        <Link href="/alertas" onClick={dismissLatest} className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{latest.title}</p>
          {latest.body && <p className="text-xs text-slate-300 mt-0.5">{latest.body}</p>}
        </Link>
        <button onClick={dismissLatest} className="text-slate-400 hover:text-white" aria-label="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
