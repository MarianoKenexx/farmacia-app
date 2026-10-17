'use client'
import { Lock } from 'lucide-react'

export default function SinAccesoPage() {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="text-center max-w-sm">
        <Lock className="w-12 h-12 mx-auto text-slate-600 mb-4" />
        <h1 className="text-xl font-semibold text-white mb-2">Sin secciones habilitadas</h1>
        <p className="text-slate-400 text-sm">
          Tu usuario todavía no tiene secciones asignadas. Pedile a un administrador que te habilite el acceso.
        </p>
      </div>
    </div>
  )
}
