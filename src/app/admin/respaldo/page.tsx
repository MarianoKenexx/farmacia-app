'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Download, Upload, DatabaseBackup, CheckCircle, AlertTriangle, X } from 'lucide-react'

const TABLE_LABEL: Record<string, string> = {
  app_settings: 'Configuración del negocio',
  categories: 'Categorías',
  obras_sociales: 'Obras sociales',
  proveedores: 'Proveedores',
  customers: 'Clientes',
  products: 'Productos',
  cash_registers: 'Cajas (aperturas/cierres)',
  lotes: 'Lotes / vencimientos',
  compras: 'Compras',
  compra_items: 'Ítems de compras',
  sales: 'Ventas / comandas',
  sale_items: 'Ítems de venta',
  cash_withdrawals: 'Retiros de caja',
  price_change_log: 'Auditoría de precios',
  alerts: 'Alertas',
  stock_movements: 'Movimientos de stock',
}

export default function RespaldoPage() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportMsg, setExportMsg] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ name: string; data: Record<string, unknown> } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    setExportError('')
    setExportMsg('')
    const { data, error } = await supabase.rpc('export_backup')
    setExporting(false)
    if (error || !data) {
      setExportError(error?.message || 'No se pudo exportar la base de datos.')
      return
    }
    const fecha = new Date().toISOString().slice(0, 10)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `respaldo-farmacia-${fecha}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setExportMsg('Listo, se descargó el archivo de respaldo.')
    setTimeout(() => setExportMsg(''), 5000)
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('formato inválido')
        }
        setPendingFile({ name: file.name, data: parsed })
        setConfirmOpen(true)
      } catch {
        setImportError('Ese archivo no parece un respaldo válido (tiene que ser el .json que bajaste con "Exportar").')
      }
    }
    reader.onerror = () => setImportError('No se pudo leer el archivo.')
    reader.readAsText(file)
  }

  async function confirmImport() {
    if (!pendingFile) return
    setImporting(true)
    setImportError('')
    const { data, error } = await supabase.rpc('import_backup', { p_data: pendingFile.data })
    setImporting(false)
    if (error) {
      setImportError(error.message)
      return
    }
    setConfirmOpen(false)
    setPendingFile(null)
    setImportResult((data as Record<string, number>) || {})
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al panel admin
        </Link>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-violet-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <DatabaseBackup className="w-5 h-5 text-violet-400" /> Respaldo de la base de datos
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          Bajar un archivo con todos los datos del negocio, para tener una copia guardada, y poder cargarlo de nuevo si algo se rompe o se borra por error.
        </p>
      </div>

      {/* Exportar */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-3">
        <h2 className="text-white font-semibold flex items-center gap-2"><Download className="w-4 h-4 text-emerald-400" /> Exportar (descargar respaldo)</h2>
        <p className="text-sm text-slate-400">
          Descarga un archivo <span className="font-mono text-slate-300">.json</span> con productos, clientes, ventas/comandas, stock, caja, compras, proveedores y toda la demás información del negocio. Guardalo en un lugar seguro (tu computadora, Google Drive, etc.) — cuantas más veces lo hagas, mejor cubierto estás.
        </p>
        <p className="text-xs text-slate-500">
          No incluye los usuarios ni sus contraseñas/PIN, ni las credenciales de facturación electrónica — esos se manejan aparte y no es necesario respaldarlos acá.
        </p>
        {exportError && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{exportError}</p>
        )}
        {exportMsg && (
          <p className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> {exportMsg}</p>
        )}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
        >
          <Download className="w-4 h-4" /> {exporting ? 'Generando archivo...' : 'Exportar y descargar'}
        </button>
      </div>

      {/* Importar */}
      <div className="bg-slate-800 border border-amber-500/30 rounded-2xl p-6 space-y-3">
        <h2 className="text-white font-semibold flex items-center gap-2"><Upload className="w-4 h-4 text-amber-400" /> Importar (cargar un respaldo)</h2>
        <p className="text-sm text-slate-400">
          Subí un archivo <span className="font-mono text-slate-300">.json</span> exportado antes desde acá mismo. Se agrega o actualiza por cada dato — <b className="text-white">nunca borra</b> lo que ya está cargado ahora, así que no hay riesgo de perder algo nuevo por cargar un respaldo viejo.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFileChosen} className="hidden" />
        {importError && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{importError}</p>
        )}
        {importResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5 text-sm text-emerald-300 space-y-1">
            <p className="flex items-center gap-1.5 font-semibold"><CheckCircle className="w-4 h-4" /> Respaldo cargado correctamente.</p>
            <ul className="text-xs text-emerald-400/90 pl-1 space-y-0.5">
              {Object.entries(importResult).filter(([, n]) => n > 0).map(([t, n]) => (
                <li key={t}>{TABLE_LABEL[t] ?? t}: {n} fila{n !== 1 ? 's' : ''}</li>
              ))}
              {Object.values(importResult).every(n => n === 0) && <li>El archivo no tenía datos nuevos para cargar.</li>}
            </ul>
          </div>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
        >
          <Upload className="w-4 h-4" /> Elegir archivo e importar
        </button>
      </div>

      {/* Confirmación antes de importar */}
      {confirmOpen && pendingFile && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-amber-500/40 rounded-2xl p-5 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Confirmar importación
              </h2>
              <button onClick={() => { setConfirmOpen(false); setPendingFile(null) }} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-slate-300">
              Vas a cargar <span className="font-mono text-amber-300">{pendingFile.name}</span>. Esto agrega o actualiza datos en la base actual — no borra nada que ya esté cargado. Si el archivo trae un producto, cliente o venta que ya existe (mismo registro), lo va a actualizar con los valores del archivo.
            </p>
            {importError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{importError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setConfirmOpen(false); setPendingFile(null) }} className="text-sm text-slate-300 hover:text-white px-3 py-2">Cancelar</button>
              <button
                onClick={confirmImport}
                disabled={importing}
                className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {importing ? 'Importando...' : 'Sí, importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
