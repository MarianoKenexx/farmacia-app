'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, PackageCheck, ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react'

export default function StockPage() {
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

  useEffect(() => { fetchProducts() }, [])

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
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500">{p.min_stock}</td>
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
                <p className="text-sm text-slate-500">Stock actual: <strong>{selected.stock}</strong></p>
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
    </div>
  )
}
