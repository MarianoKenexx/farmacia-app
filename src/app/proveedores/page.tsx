'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/image'
import { Proveedor, Compra, Product } from '@/types'
import { Truck, Plus, ShoppingBag, Package2, Paperclip, FileImage, X } from 'lucide-react'

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

interface CompraLinea { product_id: string; name: string; quantity: string; costo_unitario: string }

export default function ProveedoresPage() {
  const [tab, setTab] = useState<'proveedores' | 'compras'>('compras')

  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // alta de proveedor
  const [showNewProv, setShowNewProv] = useState(false)
  const [provForm, setProvForm] = useState({ nombre: '', cuit: '', telefono: '', contacto: '' })
  const [savingProv, setSavingProv] = useState(false)
  const [provError, setProvError] = useState('')

  // alta de compra
  const [showNewCompra, setShowNewCompra] = useState(false)
  const [proveedorId, setProveedorId] = useState('')
  const [factura, setFactura] = useState('')
  const [lineas, setLineas] = useState<CompraLinea[]>([])
  const [buscar, setBuscar] = useState('')
  const [savingCompra, setSavingCompra] = useState(false)
  const [compraError, setCompraError] = useState('')
  const [facturaFile, setFacturaFile] = useState<File | null>(null)
  const [facturaPreview, setFacturaPreview] = useState<string | null>(null)
  const [procesandoFoto, setProcesandoFoto] = useState(false)
  const [verFacturaLoading, setVerFacturaLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: prov }, { data: comp }, { data: prod }] = await Promise.all([
      supabase.from('proveedores').select('*').order('nombre'),
      supabase.from('compras').select('*, proveedores(nombre), compra_items(*)').order('created_at', { ascending: false }).limit(100),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ])
    setProveedores((prov ?? []) as Proveedor[])
    setCompras((comp ?? []) as unknown as Compra[])
    setProducts((prod ?? []) as Product[])
    const { data: profs } = await supabase.from('profiles').select('id, name')
    setNames(Object.fromEntries((profs ?? []).map(p => [p.id, p.name])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveProveedor() {
    if (!provForm.nombre.trim()) { setProvError('Poné un nombre'); return }
    setSavingProv(true); setProvError('')
    const { error } = await supabase.from('proveedores').insert({
      nombre: provForm.nombre.trim(),
      cuit: provForm.cuit.trim() || null,
      telefono: provForm.telefono.trim() || null,
      contacto: provForm.contacto.trim() || null,
    })
    setSavingProv(false)
    if (error) { setProvError(error.message); return }
    setShowNewProv(false)
    setProvForm({ nombre: '', cuit: '', telefono: '', contacto: '' })
    load()
  }

  function agregarLinea(p: Product) {
    if (lineas.some(l => l.product_id === p.id)) return
    setLineas(ls => [...ls, { product_id: p.id, name: p.name, quantity: '1', costo_unitario: String(p.purchase_price ?? 0) }])
    setBuscar('')
  }

  function quitarLinea(id: string) {
    setLineas(ls => ls.filter(l => l.product_id !== id))
  }

  const totalCompra = lineas.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costo_unitario) || 0), 0)

  async function handleFacturaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Achicamos y comprimimos igual que con las fotos de producto, pero
    // con un poco más de resolución para que después se pueda leer el texto.
    setProcesandoFoto(true)
    try {
      const compressed = await compressImage(file, { maxDimension: 1800, quality: 0.82 })
      setFacturaFile(compressed)
      setFacturaPreview(URL.createObjectURL(compressed))
    } finally {
      setProcesandoFoto(false)
    }
  }

  function quitarFoto() {
    setFacturaFile(null)
    setFacturaPreview(null)
  }

  async function verFactura(c: Compra) {
    if (!c.foto_factura_path) return
    setVerFacturaLoading(c.id)
    const { data, error } = await supabase.storage
      .from('compra-facturas')
      .createSignedUrl(c.foto_factura_path, 60)
    setVerFacturaLoading(null)
    if (error || !data?.signedUrl) { alert('No se pudo abrir la foto de la factura'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function guardarCompra() {
    if (lineas.length === 0) { setCompraError('Agregá al menos un producto'); return }
    setSavingCompra(true); setCompraError('')

    let fotoPath: string | null = null
    if (facturaFile) {
      const ext = facturaFile.name.split('.').pop()
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('compra-facturas').upload(path, facturaFile)
      if (upErr) { setSavingCompra(false); setCompraError('No se pudo subir la foto de la factura: ' + upErr.message); return }
      fotoPath = path
    }

    const { error } = await supabase.rpc('registrar_compra', {
      p_proveedor_id: proveedorId || null,
      p_numero_factura: factura || null,
      p_items: lineas.map(l => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        costo_unitario: Number(l.costo_unitario),
      })),
      p_foto_factura_path: fotoPath,
    })
    setSavingCompra(false)
    if (error) { setCompraError(error.message); return }
    setShowNewCompra(false)
    setProveedorId(''); setFactura(''); setLineas([]); quitarFoto()
    load()
  }

  const sugeridos = buscar.trim()
    ? products.filter(p => p.name.toLowerCase().includes(buscar.trim().toLowerCase())).slice(0, 8)
    : []

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-sky-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-sky-400" /> Proveedores y compras
          </h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          A quién le comprás y a qué costo. Cada compra suma stock automáticamente y actualiza el precio de costo del producto.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('compras')} className={`px-4 py-2 rounded-xl text-sm font-medium border ${tab === 'compras' ? 'bg-sky-500/10 border-sky-500/40 text-sky-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>Compras</button>
        <button onClick={() => setTab('proveedores')} className={`px-4 py-2 rounded-xl text-sm font-medium border ${tab === 'proveedores' ? 'bg-sky-500/10 border-sky-500/40 text-sky-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>Proveedores</button>
        <div className="flex-1" />
        {tab === 'compras' ? (
          <button onClick={() => { setShowNewCompra(true); setCompraError('') }} className="flex items-center gap-2 text-sm bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-xl"><Plus className="w-4 h-4" /> Registrar compra</button>
        ) : (
          <button onClick={() => { setShowNewProv(true); setProvError('') }} className="flex items-center gap-2 text-sm bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-xl"><Plus className="w-4 h-4" /> Nuevo proveedor</button>
        )}
      </div>

      {loading ? (
        <p className="text-center py-10 text-slate-400">Cargando...</p>
      ) : tab === 'proveedores' ? (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          {proveedores.length === 0 ? (
            <div className="text-center py-12 text-slate-400">Todavía no cargaste proveedores</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Nombre</th>
                <th className="px-4 py-3 font-medium text-slate-400">CUIT</th>
                <th className="px-4 py-3 font-medium text-slate-400">Contacto</th>
                <th className="px-4 py-3 font-medium text-slate-400">Teléfono</th>
              </tr></thead>
              <tbody>
                {proveedores.map(p => (
                  <tr key={p.id} className="border-b border-slate-700/60 last:border-0">
                    <td className="px-4 py-3 text-white">{p.nombre}</td>
                    <td className="px-4 py-3 text-slate-400">{p.cuit ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{p.contacto ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{p.telefono ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          {compras.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-slate-400">Todavía no registraste compras</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Fecha</th>
                <th className="px-4 py-3 font-medium text-slate-400">Proveedor</th>
                <th className="px-4 py-3 font-medium text-slate-400">Factura</th>
                <th className="px-4 py-3 font-medium text-slate-400">Ítems</th>
                <th className="px-4 py-3 font-medium text-slate-400">Registró</th>
                <th className="px-4 py-3 font-medium text-slate-400 text-right">Total</th>
              </tr></thead>
              <tbody>
                {compras.map(c => (
                  <tr key={c.id} className="border-b border-slate-700/60 last:border-0">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-white">{c.proveedores?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">
                      <div className="flex items-center gap-2">
                        <span>{c.numero_factura ?? '—'}</span>
                        {c.foto_factura_path && (
                          <button onClick={() => verFactura(c)} disabled={verFacturaLoading === c.id}
                            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 disabled:opacity-50">
                            <FileImage className="w-3 h-3" /> {verFacturaLoading === c.id ? 'Abriendo...' : 'Ver foto'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.compra_items?.length ?? 0}</td>
                    <td className="px-4 py-3 text-slate-400">{c.created_by ? (names[c.created_by] ?? '?') : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(Number(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Nuevo proveedor */}
      {showNewProv && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full space-y-3">
            <h2 className="text-white font-semibold">Nuevo proveedor</h2>
            <input value={provForm.nombre} onChange={e => setProvForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre / droguería" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500" />
            <input value={provForm.cuit} onChange={e => setProvForm(f => ({ ...f, cuit: e.target.value }))} placeholder="CUIT (opcional)" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500" />
            <input value={provForm.contacto} onChange={e => setProvForm(f => ({ ...f, contacto: e.target.value }))} placeholder="Persona de contacto (opcional)" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500" />
            <input value={provForm.telefono} onChange={e => setProvForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Teléfono (opcional)" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500" />
            {provError && <p className="text-sm text-red-400">{provError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowNewProv(false)} className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-xl">Cancelar</button>
              <button onClick={saveProveedor} disabled={savingProv} className="px-4 py-2 text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-xl disabled:opacity-50">{savingProv ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Nueva compra */}
      {showNewCompra && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full space-y-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-white font-semibold flex items-center gap-2"><Package2 className="w-4 h-4" /> Registrar compra</h2>
            <div className="grid grid-cols-2 gap-2">
              <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white">
                <option value="">Sin proveedor</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <input value={factura} onChange={e => setFactura(e.target.value)} placeholder="N° factura (opcional)" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500" />
            </div>

            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
              {facturaPreview ? (
                <>
                  <img src={facturaPreview} alt="Foto de la factura" className="w-10 h-10 rounded-lg object-cover border border-slate-600" />
                  <span className="flex-1 text-sm text-slate-300">Foto de la factura cargada</span>
                  <button type="button" onClick={quitarFoto} className="text-slate-400 hover:text-red-400"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <label className="flex items-center gap-2 text-sm text-slate-400 hover:text-white cursor-pointer w-full">
                  <Paperclip className="w-4 h-4" />
                  {procesandoFoto ? 'Optimizando...' : 'Adjuntar foto de la factura (opcional)'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    disabled={procesandoFoto} onChange={handleFacturaChange} />
                </label>
              )}
            </div>

            <div className="relative">
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto para agregar..." className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500" />
              {sugeridos.length > 0 && (
                <div className="absolute z-10 w-full bg-slate-800 border border-slate-700 rounded-xl mt-1 overflow-hidden">
                  {sugeridos.map(p => (
                    <button key={p.id} onClick={() => agregarLinea(p)} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700">{p.name}</button>
                  ))}
                </div>
              )}
            </div>

            {lineas.length > 0 && (
              <div className="space-y-2">
                {lineas.map(l => (
                  <div key={l.product_id} className="flex items-center gap-2 bg-slate-800 rounded-xl p-2">
                    <span className="flex-1 text-sm text-white truncate">{l.name}</span>
                    <input type="number" value={l.quantity} onChange={e => setLineas(ls => ls.map(x => x.product_id === l.product_id ? { ...x, quantity: e.target.value } : x))} className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white" placeholder="cant." />
                    <input type="number" value={l.costo_unitario} onChange={e => setLineas(ls => ls.map(x => x.product_id === l.product_id ? { ...x, costo_unitario: e.target.value } : x))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white" placeholder="costo" />
                    <button onClick={() => quitarLinea(l.product_id)} className="text-xs text-red-400 hover:text-red-300 px-2">Quitar</button>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold text-white border-t border-slate-700 pt-2">
                  <span>Total</span><span className="text-emerald-400">{fmt(totalCompra)}</span>
                </div>
              </div>
            )}

            {compraError && <p className="text-sm text-red-400">{compraError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setShowNewCompra(false); quitarFoto() }} className="px-4 py-2 text-sm text-slate-300 hover:text-white rounded-xl">Cancelar</button>
              <button onClick={guardarCompra} disabled={savingCompra || procesandoFoto || lineas.length === 0} className="px-4 py-2 text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-xl disabled:opacity-50">{savingCompra ? 'Guardando...' : 'Registrar compra'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
