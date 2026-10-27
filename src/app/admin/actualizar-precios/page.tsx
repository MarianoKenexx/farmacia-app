'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react'

// ════════════════════════════════════════════════════════════════════
// Actualizar precios en bloque desde un archivo de la droguería.
//
// No existe una conexión "en tiempo real" universal con las droguerías
// (cada una da lo que puede: un Excel, un CSV, a veces nada). Esta
// pantalla toma el archivo que te den, lo matchea por código de barras
// contra el catálogo, muestra una vista previa y recién al confirmar
// actualiza los precios — nunca los pisa solo.
// ════════════════════════════════════════════════════════════════════

type FilaProducto = { id: string; barcode: string; name: string; sale_price: number; purchase_price: number }

type FilaPreview = {
  barcode: string
  productId?: string
  nombre?: string
  costoActual?: number
  costoNuevo?: number | null
  ventaActual?: number
  ventaNuevo?: number | null
  matched: boolean
  incluir: boolean
}

// Convierte un valor de celda (texto o número) a precio numérico,
// tolerando formato argentino ("1.234,56") y el formato simple ("1234.56").
function parsePrecio(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return isFinite(raw) ? raw : null
  let s = String(raw).trim().replace(/[^0-9.,-]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return isFinite(n) ? n : null
}

export default function ActualizarPreciosPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [rows, setRows] = useState<unknown[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [primerFilaEsEncabezado, setPrimerFilaEsEncabezado] = useState(true)

  const [colBarcode, setColBarcode] = useState<number | null>(null)
  const [colCosto, setColCosto] = useState<number | null>(null)
  const [colVenta, setColVenta] = useState<number | null>(null)

  const [preview, setPreview] = useState<FilaPreview[] | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')

  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ ok: number; error: number } | null>(null)

  function reset() {
    setFileName(''); setParseError(''); setRows([]); setHeaders([])
    setColBarcode(null); setColCosto(null); setColVenta(null)
    setPreview(null); setBuildError(''); setApplyResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    reset()
    setFileName(file.name)
    try {
      const esCsv = /\.csv$/i.test(file.name)
      let wb: XLSX.WorkBook
      if (esCsv) {
        const text = await file.text()
        wb = XLSX.read(text, { type: 'string' })
      } else {
        const buf = await file.arrayBuffer()
        wb = XLSX.read(buf, { type: 'array' })
      }
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]
      const limpio = data.filter(r => r.some(c => String(c ?? '').trim() !== ''))
      if (limpio.length === 0) { setParseError('El archivo está vacío.'); return }
      setRows(limpio)
      setHeaders((limpio[0] || []).map((h, i) => (String(h ?? '').trim() || `Columna ${i + 1}`)))
    } catch {
      setParseError('No se pudo leer el archivo. Tiene que ser un Excel (.xlsx) o un CSV.')
    }
  }

  const dataRows = primerFilaEsEncabezado ? rows.slice(1) : rows
  const colOptions = primerFilaEsEncabezado ? headers : (rows[0] || []).map((_, i) => `Columna ${i + 1}`)
  const maxCols = Math.max(0, ...rows.map(r => r.length))

  async function construirPreview() {
    setBuildError('')
    if (colBarcode === null) { setBuildError('Elegí qué columna tiene el código de barras.'); return }
    if (colCosto === null && colVenta === null) { setBuildError('Elegí al menos una columna de precio para actualizar.'); return }

    setBuilding(true)
    const { data: productos, error } = await supabase
      .from('products')
      .select('id, barcode, name, sale_price, purchase_price')
    setBuilding(false)
    if (error || !productos) { setBuildError('No se pudo leer el catálogo: ' + (error?.message || '')); return }

    const porCodigo = new Map<string, FilaProducto>()
    for (const p of productos as FilaProducto[]) {
      if (p.barcode) porCodigo.set(String(p.barcode).trim(), p)
    }

    const vistos = new Set<string>()
    const out: FilaPreview[] = []
    for (const row of dataRows) {
      const barcode = String(row[colBarcode] ?? '').trim()
      if (!barcode || vistos.has(barcode)) continue
      vistos.add(barcode)
      const prod = porCodigo.get(barcode)
      const costoNuevo = colCosto !== null ? parsePrecio(row[colCosto]) : undefined
      const ventaNuevo = colVenta !== null ? parsePrecio(row[colVenta]) : undefined
      out.push({
        barcode,
        productId: prod?.id,
        nombre: prod?.name,
        costoActual: prod?.purchase_price,
        costoNuevo: costoNuevo === undefined ? undefined : costoNuevo,
        ventaActual: prod?.sale_price,
        ventaNuevo: ventaNuevo === undefined ? undefined : ventaNuevo,
        matched: !!prod,
        incluir: !!prod,
      })
    }
    out.sort((a, b) => Number(b.matched) - Number(a.matched))
    setPreview(out)
  }

  function toggleIncluir(barcode: string) {
    setPreview(prev => prev && prev.map(f => f.barcode === barcode ? { ...f, incluir: !f.incluir } : f))
  }

  const fmt = (n: number | undefined | null) =>
    n === undefined || n === null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const aActualizar = (preview || []).filter(f => f.matched && f.incluir)
  const sinCambios = aActualizar.filter(f =>
    (f.costoNuevo === undefined || f.costoNuevo === null || f.costoNuevo === f.costoActual) &&
    (f.ventaNuevo === undefined || f.ventaNuevo === null || f.ventaNuevo === f.ventaActual)
  )
  const conCambios = aActualizar.length - sinCambios.length
  const noEncontrados = (preview || []).filter(f => !f.matched)

  async function confirmarActualizacion() {
    setApplying(true)
    setApplyResult(null)
    let ok = 0, fail = 0
    const lote = aActualizar.filter(f => !sinCambios.includes(f))
    const tamaño = 10
    for (let i = 0; i < lote.length; i += tamaño) {
      const chunk = lote.slice(i, i + tamaño)
      const resultados = await Promise.all(chunk.map(f => {
        const payload: Record<string, number> = {}
        if (f.costoNuevo !== undefined && f.costoNuevo !== null) payload.purchase_price = f.costoNuevo
        if (f.ventaNuevo !== undefined && f.ventaNuevo !== null) payload.sale_price = f.ventaNuevo
        return supabase.from('products').update(payload).eq('id', f.productId!)
      }))
      for (const r of resultados) { if (r.error) fail++; else ok++ }
    }
    setApplying(false)
    setApplyResult({ ok, error: fail })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al panel admin
        </Link>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-amber-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-400" /> Actualizar precios desde archivo
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          Subí el archivo de precios que te dé la droguería (Excel o CSV). Lo matcheamos por código de barras
          contra tus productos y vos revisás los cambios antes de confirmar — nunca se actualiza solo.
        </p>
      </div>

      {!rows.length && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
          <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
          <p className="text-slate-300 mb-3 text-sm">Seleccioná el archivo que te dio la droguería</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl font-medium text-sm"
          >
            Elegir archivo
          </button>
          {parseError && <p className="text-sm text-red-400 mt-3">{parseError}</p>}
        </div>
      )}

      {rows.length > 0 && !preview && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-300">📄 {fileName} — {rows.length} filas leídas</p>
            <button onClick={reset} className="text-xs text-slate-400 hover:text-white">cambiar archivo</button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input type="checkbox" checked={primerFilaEsEncabezado}
              onChange={e => setPrimerFilaEsEncabezado(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-amber-500" />
            La primera fila es un encabezado (no es un producto)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Columna de código de barras *</p>
              <select
                value={colBarcode ?? ''}
                onChange={e => setColBarcode(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
              >
                <option value="">Elegir columna...</option>
                {Array.from({ length: maxCols }).map((_, i) => (
                  <option key={i} value={i}>{colOptions[i] ?? `Columna ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Columna de precio de costo</p>
              <select
                value={colCosto ?? ''}
                onChange={e => setColCosto(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
              >
                <option value="">No actualizar</option>
                {Array.from({ length: maxCols }).map((_, i) => (
                  <option key={i} value={i}>{colOptions[i] ?? `Columna ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Columna de precio de venta</p>
              <select
                value={colVenta ?? ''}
                onChange={e => setColVenta(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
              >
                <option value="">No actualizar</option>
                {Array.from({ length: maxCols }).map((_, i) => (
                  <option key={i} value={i}>{colOptions[i] ?? `Columna ${i + 1}`}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Vista cruda de las primeras filas, para ubicarse */}
          <div className="overflow-x-auto border border-slate-700 rounded-xl">
            <table className="w-full text-xs">
              <tbody>
                {rows.slice(0, 4).map((r, ri) => (
                  <tr key={ri} className={ri === 0 && primerFilaEsEncabezado ? 'bg-slate-700/50 text-slate-300 font-medium' : 'text-slate-400'}>
                    {Array.from({ length: maxCols }).map((_, ci) => (
                      <td key={ci} className="px-2 py-1.5 border-b border-slate-700/50 whitespace-nowrap">{String(r[ci] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {buildError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{buildError}</p>}

          <button
            onClick={construirPreview}
            disabled={building}
            className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl font-medium text-sm disabled:opacity-50"
          >
            {building ? 'Comparando con tu catálogo...' : 'Ver cambios antes de aplicar'}
          </button>
        </div>
      )}

      {preview && !applyResult && (
        <div className="space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-5 text-sm">
              <span className="text-emerald-400 font-medium">{conCambios} con cambios</span>
              <span className="text-slate-400">{sinCambios.length} sin cambios</span>
              <span className="text-amber-400">{noEncontrados.length} no encontrados</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="text-sm text-slate-300 hover:text-white px-3 py-2">Volver</button>
              <button
                onClick={confirmarActualizacion}
                disabled={applying || conCambios === 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-medium text-sm disabled:opacity-50"
              >
                {applying ? 'Actualizando...' : `Confirmar y actualizar ${conCambios} productos`}
              </button>
            </div>
          </div>

          {noEncontrados.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
              <p className="text-sm text-amber-300 font-medium mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Códigos del archivo que no están en tu catálogo
              </p>
              <p className="text-xs text-slate-400 mb-2">No se tocan — revisá si falta cargar el código de barras en esos productos.</p>
              <div className="flex flex-wrap gap-1.5">
                {noEncontrados.slice(0, 60).map(f => (
                  <span key={f.barcode} className="text-xs font-mono bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-300">{f.barcode}</span>
                ))}
                {noEncontrados.length > 60 && <span className="text-xs text-slate-500">+{noEncontrados.length - 60} más</span>}
              </div>
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/60 text-left text-xs text-slate-400">
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Costo actual → nuevo</th>
                  <th className="px-3 py-2 text-right">Venta actual → nuevo</th>
                </tr>
              </thead>
              <tbody>
                {aActualizar.filter(f => !sinCambios.includes(f)).map(f => (
                  <tr key={f.barcode} className="border-t border-slate-700/50">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={f.incluir} onChange={() => toggleIncluir(f.barcode)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-emerald-500" />
                    </td>
                    <td className="px-3 py-2 text-white">{f.nombre}<span className="text-slate-500 font-mono text-xs ml-2">{f.barcode}</span></td>
                    <td className="px-3 py-2 text-right">
                      {f.costoNuevo === undefined ? <span className="text-slate-500">—</span> : (
                        <span className={f.costoNuevo !== f.costoActual ? 'text-amber-400' : 'text-slate-400'}>
                          {fmt(f.costoActual)} → <b>{fmt(f.costoNuevo)}</b>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {f.ventaNuevo === undefined ? <span className="text-slate-500">—</span> : (
                        <span className={f.ventaNuevo !== f.ventaActual ? 'text-emerald-400' : 'text-slate-400'}>
                          {fmt(f.ventaActual)} → <b>{fmt(f.ventaNuevo)}</b>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {applyResult && (
        <div className="bg-slate-800 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
          <CheckCircle className="w-10 h-10 mx-auto text-emerald-400" />
          <p className="text-white font-semibold">Se actualizaron {applyResult.ok} productos</p>
          {applyResult.error > 0 && <p className="text-sm text-red-400">{applyResult.error} no se pudieron actualizar</p>}
          <p className="text-xs text-slate-400">Cada cambio quedó anotado en la Auditoría de cambios de precio, como cualquier otro cambio de precio.</p>
          <button onClick={reset} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl font-medium text-sm">
            Actualizar otro archivo
          </button>
        </div>
      )}
    </div>
  )
}
