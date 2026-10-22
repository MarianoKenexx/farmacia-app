'use client'

import { useEffect, useState } from 'react'
import { fmtStock } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, PackageCheck, ArrowDownToLine, ArrowUpFromLine, Search, CalendarClock, Plus, Check } from 'lucide-react'
import { Lote } from '@/types'

const fmtFecha = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-AR')
const diasHasta = (iso: string) => Math.ceil((new Date(iso + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)

export default function StockPage() {
  const [tab, setTab] = useState<'inventario' | 'vencimientos'>('inventario')
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'ok'>('all')
  const [loading, setLoading] = useState(true)
  const [movDialog, setMovDialog] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)
  const [movType, setMovType] = useState<'entrada' | 'salida' | 'ajuste'>('entrada')
  const [movQty, setMovQty] = useState('')
  const [movReason, setMovReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Vencimientos
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loteDialog, setLoteDialog] = useState(false)
  const [loteBuscar, setLoteBuscar] = useState('')
  const [loteProductId, setLoteProductId] = useState('')
  const [loteFecha, setLoteFecha] = useState('')
  const [loteCantidad, setLoteCantidad] = useState('')
  const [loteNota, setLoteNota] = useState('')
  const [loteSaving, setLoteSaving] = useState(false)
  const [loteError, setLoteError] = useState('')

  useEffect(() => { fetchProducts(); fetchLotes() }, [])

  async function fetchLotes() {
    const { data } = await supabase
      .from('lotes')
      .select('*, products(name, laboratory)')
      .eq('consumido', false)
      .order('fecha_vencimiento')
    setLotes((data ?? []) as unknown as Lote[])
  }

  function openLoteDialog() {
    setLoteBuscar(''); setLoteProductId(''); setLoteFecha(''); setLoteCantidad(''); setLoteNota(''); setLoteError('')
    setLoteDialog(true)
  }

  async function saveLote() {
    if (!loteProductId) { setLoteError('Elegí un producto'); return }
    if (!loteFecha) { setLoteError('Poné la fecha de vencimiento'); return }
    const cant = Number(loteCantidad)
    if (!cant || cant <= 0) { setLoteError('Cantidad inválida'); return }
    setLoteSaving(true); setLoteError('')
    const { error } = await supabase.from('lotes').insert({
      product_id: loteProductId, fecha_vencimiento: loteFecha, cantidad: cant, nota: loteNota || null,
    })
    setLoteSaving(false)
    if (error) { setLoteError(error.message); return }
    setLoteDialog(false)
    fetchLotes()
  }

  async function marcarConsumido(id: string) {
    await supabase.from('lotes').update({ consumido: true }).eq('id', id)
    fetchLotes()
  }

  const lotesSugeridos = loteBuscar.trim()
    ? products.filter(p => p.name.toLowerCase().includes(loteBuscar.trim().toLowerCase())).slice(0, 8)
    : []
  const loteProductoElegido = products.find(p => p.id === loteProductId)
  const lotesVencidos = lotes.filter(l => diasHasta(l.fecha_vencimiento) < 0)
  const lotesPorVencer = lotes.filter(l => { const d = diasHasta(l.fecha_vencimiento); return d >= 0 && d <= 15 })

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name')
    setProducts(data || [])
    setLoading(false)
  }

  function openMov(p: Product, type: 'entrada' | 'salida' | 'ajuste') {
    setSelected(p)
    setMovType(type)
    setMovQty('')
    setMovReason('')
    setMovDialog(true)
  }

  async function handleMov() {
    if (!selected || !movQty) return
    setSaving(true)
    const qty = Number(movQty)
    let newStock = selected.stock
    if (movType === 'entrada') newStock += qty
    else if (movType === 'salida') newStock -= qty
    else newStock = qty

    await supabase.from('products').update({ stock: newStock }).eq('id', selected.id)
    await supabase.from('stock_movements').insert({
      product_id: selected.id,
      type: movType,
      quantity: qty,
      reason: movReason || null,
    })

    setSaving(false)
    setMovDialog(false)
    fetchProducts()
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search)
    const matchFilter = filter === 'all' || (filter === 'low' ? p.stock <= p.min_stock : p.stock > p.min_stock)
    return matchSearch && matchFilter
  })

  const lowCount = products.filter(p => p.stock <= p.min_stock).length

  const stockStatus = (p: Product) => {
    if (p.stock === 0) return { label: 'Sin stock', class: 'bg-red-100 text-red-700 border-0' }
    if (p.stock <= p.min_stock) return { label: 'Stock bajo', class: 'bg-amber-100 text-amber-700 border-0' }
    return { label: 'OK', class: 'bg-emerald-100 text-emerald-700 border-0' }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Stock</h1>
        <p className="text-sm text-slate-500">{products.length} productos · {lowCount} con stock bajo</p>
      </div>

      {lowCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{lowCount} productos</strong> tienen stock igual o menor al mínimo configurado</span>
        </div>
      )}

      {(lotesVencidos.length > 0 || lotesPorVencer.length > 0) && tab === 'inventario' && (
        <button
          onClick={() => setTab('vencimientos')}
          className="w-full flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 text-left hover:bg-red-100"
        >
          <CalendarClock className="w-4 h-4 shrink-0" />
          <span>
            {lotesVencidos.length > 0 && <><strong>{lotesVencidos.length} lotes vencidos</strong>{lotesPorVencer.length > 0 && ' · '}</>}
            {lotesPorVencer.length > 0 && <><strong>{lotesPorVencer.length} por vencer en 15 días</strong></>}
            {' '}— ver vencimientos
          </span>
        </button>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant={tab === 'inventario' ? 'default' : 'outline'} className={tab === 'inventario' ? 'bg-slate-800' : ''} onClick={() => setTab('inventario')}>Inventario</Button>
        <Button size="sm" variant={tab === 'vencimientos' ? 'default' : 'outline'} className={tab === 'vencimientos' ? 'bg-slate-800' : ''} onClick={() => setTab('vencimientos')}>
          Vencimientos{(lotesVencidos.length + lotesPorVencer.length) > 0 ? ` (${lotesVencidos.length + lotesPorVencer.length})` : ''}
        </Button>
      </div>

      {tab === 'vencimientos' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Control aparte para avisarte qué lotes vencen pronto. No reemplaza el conteo de stock total de arriba.
            </p>
            <Button size="sm" onClick={openLoteDialog} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 shrink-0">
              <Plus className="w-3.5 h-3.5" /> Cargar lote
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {lotes.length === 0 ? (
                <p className="text-center py-8 text-slate-400">No hay lotes cargados todavía</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-4 py-3 font-medium text-slate-600">Producto</th>
                      <th className="px-4 py-3 font-medium text-slate-600">Vencimiento</th>
                      <th className="px-4 py-3 font-medium text-slate-600 text-center">Cantidad</th>
                      <th className="px-4 py-3 font-medium text-slate-600">Estado</th>
                      <th className="px-4 py-3 font-medium text-slate-600 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotes.map(l => {
                      const d = diasHasta(l.fecha_vencimiento)
                      const estado = d < 0
                        ? { label: 'Vencido', class: 'bg-red-100 text-red-700 border-0' }
                        : d <= 15
                        ? { label: `Vence en ${d} día${d === 1 ? '' : 's'}`, class: 'bg-amber-100 text-amber-700 border-0' }
                        : { label: 'OK', class: 'bg-emerald-100 text-emerald-700 border-0' }
                      return (
                        <tr key={l.id} className="border-b hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{l.products?.name ?? '(producto borrado)'}</p>
                            {l.nota && <p className="text-xs text-slate-400">{l.nota}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{fmtFecha(l.fecha_vencimiento)}</td>
                          <td className="px-4 py-3 text-center text-slate-700">{l.cantidad}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className={estado.class}>{estado.label}</Badge></td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => marcarConsumido(l.id)}>
                              <Check className="w-3 h-3" /> Dar de baja
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
      <>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar producto..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(['all', 'low', 'ok'] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
              className={filter === f ? 'bg-slate-800' : ''}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : f === 'low' ? 'Stock bajo' : 'OK'}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-8 text-slate-400 animate-pulse">Cargando...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-4 py-3 font-medium text-slate-600">Producto</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-center">Stock actual</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-center">Stock mínimo</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Estado</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const st = stockStatus(p)
                  return (
                    <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{p.name}</p>
                        {p.laboratory && <p className="text-xs text-slate-400">{p.laboratory}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-base ${p.stock <= p.min_stock ? 'text-red-500' : 'text-slate-700'}`}>
                          {fmtStock(p.stock)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500">{fmtStock(p.min_stock)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={st.class}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="gap-1 text-xs"
                            onClick={() => openMov(p, 'entrada')}>
                            <ArrowDownToLine className="w-3 h-3" /> Entrada
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-xs"
                            onClick={() => openMov(p, 'ajuste')}>
                            <PackageCheck className="w-3 h-3" /> Ajustar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      </>
      )}

      <Dialog open={movDialog} onOpenChange={setMovDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {movType === 'entrada' ? 'Entrada de stock' : movType === 'salida' ? 'Salida de stock' : 'Ajuste de stock'}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-medium text-slate-800">{selected.name}</p>
                <p className="text-sm text-slate-500">Stock actual: <strong>{fmtStock(selected.stock)}</strong></p>
              </div>
              <div>
                <Label>{movType === 'ajuste' ? 'Nuevo stock total' : 'Cantidad'}</Label>
                <Input type="number" value={movQty} onChange={e => setMovQty(e.target.value)} autoFocus />
              </div>
              <div>
                <Label>Motivo (opcional)</Label>
                <Input value={movReason} onChange={e => setMovReason(e.target.value)}
                  placeholder="Ej: Compra a proveedor, rotura..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(false)}>Cancelar</Button>
            <Button onClick={handleMov} disabled={saving || !movQty}
              className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Guardando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={loteDialog} onOpenChange={setLoteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cargar lote con vencimiento</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Label>Producto</Label>
              {loteProductoElegido ? (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 mt-1">
                  <span className="text-sm font-medium text-slate-800">{loteProductoElegido.name}</span>
                  <button onClick={() => setLoteProductId('')} className="text-xs text-slate-400 hover:text-slate-600">cambiar</button>
                </div>
              ) : (
                <>
                  <Input value={loteBuscar} onChange={e => setLoteBuscar(e.target.value)} placeholder="Buscar producto..." autoFocus />
                  {lotesSugeridos.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl mt-1 shadow-lg overflow-hidden">
                      {lotesSugeridos.map(p => (
                        <button key={p.id} onClick={() => { setLoteProductId(p.id); setLoteBuscar('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">{p.name}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <Label>Fecha de vencimiento</Label>
              <Input type="date" value={loteFecha} onChange={e => setLoteFecha(e.target.value)} />
            </div>
            <div>
              <Label>Cantidad</Label>
              <Input type="number" value={loteCantidad} onChange={e => setLoteCantidad(e.target.value)} />
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Input value={loteNota} onChange={e => setLoteNota(e.target.value)} placeholder="Ej: lote #123" />
            </div>
          </div>
          {loteError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{loteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoteDialog(false)}>Cancelar</Button>
            <Button onClick={saveLote} disabled={loteSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {loteSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
