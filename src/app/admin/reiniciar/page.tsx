'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { AlertTriangle, Trash2, ShieldAlert } from 'lucide-react'

const FRASE_CONFIRMACION = 'BORRAR TODO'

const TABLAS_QUE_SE_BORRAN = [
  'Productos y categorías',
  'Clientes',
  'Proveedores y compras',
  'Obras sociales',
  'Ventas, caja y movimientos de stock',
  'Lotes/vencimientos',
  'Auditoría de precios',
  'Alertas',
  'Fotos de productos y de facturas',
]

const TABLAS_QUE_SE_MANTIENEN = [
  'Usuarios y contraseñas (seguís pudiendo entrar)',
  'Marca, logo y configuración del ticket',
  'Configuración de ARCA (si la cargaste)',
]

export default function ReiniciarPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [frase, setFrase] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const esSuperadmin = profile?.role === 'superadmin'

  async function vaciarCarpeta(bucket: string) {
    const { data } = await supabase.storage.from(bucket).list('', { limit: 1000 })
    const paths = (data ?? []).filter(f => f.name).map(f => f.name)
    if (paths.length > 0) {
      await supabase.storage.from(bucket).remove(paths)
    }
  }

  async function confirmar() {
    setError('')
    if (frase.trim().toUpperCase() !== FRASE_CONFIRMACION) {
      setError(`Escribí exactamente "${FRASE_CONFIRMACION}" para confirmar`)
      return
    }
    if (!password) {
      setError('Ingresá tu contraseña de superadmin')
      return
    }
    if (!profile?.email) {
      setError('No se pudo identificar tu usuario, recargá la página e intentá de nuevo')
      return
    }
    setLoading(true)

    // 1) Re-validamos que quien aprieta el botón sabe la contraseña del
    //    superadmin logueado — no alcanza con estar la sesión abierta.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    })
    if (authError) {
      setLoading(false)
      setError('Contraseña incorrecta')
      return
    }

    // 2) Borramos todo en la base de datos (la función vuelve a chequear
    //    del lado del servidor que sea un superadmin).
    const { error: rpcError } = await supabase.rpc('reiniciar_datos_app')
    if (rpcError) {
      setLoading(false)
      setError('No se pudo reiniciar: ' + rpcError.message)
      return
    }

    // 3) Vaciamos las fotos (productos y facturas) para no dejar basura
    //    huérfana ocupando espacio.
    await Promise.all([
      vaciarCarpeta('product-images'),
      vaciarCarpeta('compra-facturas'),
    ])

    setLoading(false)
    setDone(true)
  }

  if (!esSuperadmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-slate-400">No tenés permiso para ver esta sección.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <ShieldAlert className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
        <h1 className="text-xl font-bold text-white mb-2">Listo, la app quedó reiniciada</h1>
        <p className="text-slate-400 mb-6">Se borraron todos los datos de prueba. Los usuarios y la configuración de la farmacia se mantienen.</p>
        <button onClick={() => router.push('/dashboard')} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium">
          Ir al Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-red-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" /> Reiniciar la app
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          Para cuando termines el período de prueba y quieras arrancar a operar con todo en cero. Esta acción es irreversible.
        </p>
      </div>

      <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-white font-medium mb-1">Esto se borra para siempre</p>
            <ul className="text-sm text-slate-300 list-disc list-inside space-y-0.5">
              {TABLAS_QUE_SE_BORRAN.map(t => <li key={t}>{t}</li>)}
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-700 pt-4">
          <p className="text-white font-medium mb-1">Esto se mantiene</p>
          <ul className="text-sm text-slate-400 list-disc list-inside space-y-0.5">
            {TABLAS_QUE_SE_MANTIENEN.map(t => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </div>

      <button
        onClick={() => { setOpen(true); setFrase(''); setPassword(''); setError('') }}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-xl font-medium"
      >
        <Trash2 className="w-4 h-4" /> Reiniciar todo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-semibold">Esto no se puede deshacer</h2>
            </div>
            <p className="text-sm text-slate-300">
              Se van a borrar todos los productos, ventas, clientes y el resto de los datos cargados.
              Para confirmar, escribí <span className="font-mono text-red-400">{FRASE_CONFIRMACION}</span> y
              poné tu contraseña de superadmin.
            </p>
            <input
              value={frase}
              onChange={e => setFrase(e.target.value)}
              placeholder={FRASE_CONFIRMACION}
              name="frase-confirmacion-reinicio"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 font-mono"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              name="password-confirmacion-reinicio"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setOpen(false)} disabled={loading} className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-xl disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={loading}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl disabled:opacity-50"
              >
                {loading ? 'Borrando...' : 'Sí, borrar todo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
