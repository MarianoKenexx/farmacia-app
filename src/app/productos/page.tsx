'use client'

import { useEffect, useState, useRef } from 'react'
import { fmtStock, fmtUnidades } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { Product, Category, TIPO_VENTA_LABEL } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, Pencil, Trash2, PackageX, ImageIcon, X } from 'lucide-react'

const emptyProduct = {
  name: '', barcode: '', category_id: '', laboratory: '',
  purchase_price: 0, sale_price: 0, stock: 0, min_stock: 5, iva_rate: 21, active: true,
  image_url: '', unidades_por_envase: 1, nombre_fraccion: 'unidad', tipo_venta: 'libre' as Product['tipo_venta'],
}

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>(emptyProduct)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setProducts(prodRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  function openNew() {
    setForm(emptyProduct)
    setEditing(null)
    setImageFile(null)
    setImagePreview(null)
    setOpen(true)
  }

  function openEdit(p: Product) {
    setForm({
      ...p,
      barcode: p.barcode ?? '',
      laboratory: p.laboratory ?? '',
      category_id: p.category_id ?? '',
      image_url: p.image_url ?? '',
      unidades_por_envase: p.unidades_por_envase ?? 1,
      nombre_fraccion: p.nombre_fraccion ?? 'unidad',
      tipo_venta: p.tipo_venta ?? 'libre',
    })
    setEditing(p.id)
    setImageFile(null)
    setImagePreview(p.image_url || null)
    setOpen(true)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    setForm((f: any) => ({ ...f, image_url: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadImage(productId: string): Promise<string | null> {
    if (!imageFile) return form.image_url || null
    const ext = imageFile.name.split('.').pop()
    const path = `${productId}.${ext}`
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, imageFile, { upsert: true })
    if (error) { console.error(error); return null }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave() {
    setSaving(true)
    const uPorE = Math.max(1, parseInt(form.unidades_por_envase) || 1)
    const payload: any = {
      name: form.name,
      barcode: form.barcode || null,
      category_id: form.category_id || null,
      laboratory: form.laboratory || null,
      purchase_price: Number(form.purchase_price),
      sale_price: Number(form.sale_price),
      stock: Number(form.stock),
      min_stock: Number(form.min_stock),
      iva_rate: Number(form.iva_rate),
      active: form.active,
      unidades_por_envase: uPorE,
      nombre_fraccion: uPorE > 1 ? (form.nombre_fraccion || 'unidad') : 'unidad',
      tipo_venta: form.tipo_venta || 'libre',
    }

    let productId = editing

    if (editing) {
      const { error } = await supabase.from('products').update(payload).eq('id', editing)
      if (error) {
        console.error('Error al actualizar producto:', error)
        alert('Error al guardar: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select('id').single()
      if (error) {
        console.error('Error al crear producto:', error)
        alert('Error al guardar: ' + error.message)
        setSaving(false)
        return
      }
      productId = data?.id ?? null
    }

    if (productId) {
      const imageUrl = await uploadImage(productId)
      if (imageUrl !== null) {
        await supabase.from('products').update({ image_url: imageUrl }).eq('id', productId)
      }
    }

    setSaving(false)
    setOpen(false)
    fetchAll()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este producto?')) return
    await supabase.from('products').delete().eq('id', id)
    fetchAll()
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(search.toLowerCase()) ||
    p.laboratory?.toLowerCase().includes(search.toLowerCase())
  )

  const margen = (p: Product) => p.purchase_price > 0
    ? (((p.sale_price - p.purchase_price) / p.purchase_price) * 100).toFixed(1)
    : '—'

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const stockLabel = (p: Product) => {
    const u = p.unidades_por_envase ?? 1
    if (u <= 1) return `${fmtStock(p.stock)} u`
    return `${fmtStock(p.stock)} cajas / ${fmtUnidades(p.stock, u)} ${p.nombre_fraccion ?? 'unidad'}s`
  }

  const uPorE = parseInt(form.unidades_por_envase) || 1

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
          <p className="text-sm text-slate-500">{products.length} productos en catálogo</p>
        </div>
        <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" /> Nuevo producto
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, código de barras o laboratorio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-8 text-slate-400 animate-pulse">Cargando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <PackageX className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-slate-400">No hay productos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-4 py-3 font-medium text-slate-600">Producto</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Laboratorio</th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">P. Compra</th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">P. Venta</th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">Margen</th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">Stock</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name}
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                              <ImageIcon className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-slate-800">{p.name}</p>
                              {p.tipo_venta && p.tipo_venta !== 'libre' && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.tipo_venta === 'receta_archivada' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {TIPO_VENTA_LABEL[p.tipo_venta]}
                                </span>
                              )}
                            </div>
                            {p.barcode && <p className="text-xs text-slate-400">{p.barcode}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.laboratory || '—'}</td>
                      <td className="px-4 py-3 text-right">{fmt(p.purchase_price)}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(p.sale_price)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-emerald-600 font-medium">{margen(p)}%</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={p.stock <= p.min_stock ? 'text-red-500 font-bold' : ''}>
                          {stockLabel(p)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.active ? 'default' : 'secondary'}
                          className={p.active ? 'bg-emerald-100 text-emerald-700 border-0' : ''}>
                          {p.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(p.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {/* Imagen */}
            <div>
              <Label>Imagen del producto</Label>
              <div className="mt-1.5 flex items-center gap-3">
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="preview"
                      className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                  >
                    <ImageIcon className="w-6 h-6 text-slate-300" />
                    <span className="text-xs text-slate-400 mt-1">Subir</span>
                  </div>
                )}
                <div className="flex-1">
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => fileInputRef.current?.click()}>
                    {imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                  </Button>
                  <p className="text-xs text-slate-400 mt-1">JPG, PNG o WEBP. Máx 5MB.</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} />
              </div>
              <div>
                <Label>Laboratorio</Label>
                <Input value={form.laboratory} onChange={e => setForm({...form, laboratory: e.target.value})} />
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={form.category_id} onValueChange={v => setForm({...form, category_id: v})}>
                  <SelectTrigger>
                    {form.category_id
                      ? <span>{categories.find(c => c.id === form.category_id)?.name ?? 'Seleccionar'}</span>
                      : <span className="text-muted-foreground">Seleccionar</span>}
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de venta</Label>
                <Select value={form.tipo_venta} onValueChange={v => setForm({...form, tipo_venta: v})}>
                  <SelectTrigger>
                    <span>{TIPO_VENTA_LABEL[form.tipo_venta as Product['tipo_venta']] ?? 'Venta libre'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="libre">Venta libre</SelectItem>
                    <SelectItem value="receta">Bajo receta</SelectItem>
                    <SelectItem value="receta_archivada">Receta archivada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>IVA %</Label>
                <Input type="number" value={form.iva_rate}
                  onChange={e => setForm({...form, iva_rate: e.target.value})} />
              </div>
              <div>
                <Label>Precio compra</Label>
                <Input type="number" value={form.purchase_price}
                  onChange={e => setForm({...form, purchase_price: e.target.value})} />
              </div>
              <div>
                <Label>Precio venta (por caja/envase)</Label>
                <Input type="number" value={form.sale_price}
                  onChange={e => setForm({...form, sale_price: e.target.value})} />
              </div>
              <div>
                <Label>Stock actual (cajas)</Label>
                <Input type="number" value={form.stock}
                  onChange={e => setForm({...form, stock: e.target.value})} />
              </div>
              <div>
                <Label>Stock mínimo (cajas)</Label>
                <Input type="number" value={form.min_stock}
                  onChange={e => setForm({...form, min_stock: e.target.value})} />
              </div>
            </div>

            {/* Contenido del envase / fraccionamiento */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Contenido del envase</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unidades por caja</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.unidades_por_envase}
                    onChange={e => setForm({...form, unidades_por_envase: e.target.value})}
                  />
                  {uPorE > 1 && (
                    <p className="text-xs text-emerald-600 mt-1">
                      {form.stock || 0} cajas → {(parseInt(form.stock) || 0) * uPorE} {form.nombre_fraccion || 'unidades'}
                    </p>
                  )}
                </div>
                {uPorE > 1 && (
                  <div>
                    <Label>Nombre de la fracción</Label>
                    <Input
                      placeholder="ej: blister, tira, comprimido"
                      value={form.nombre_fraccion}
                      onChange={e => setForm({...form, nombre_fraccion: e.target.value})}
                    />
                  </div>
                )}
              </div>
              {uPorE > 1 && (
                <div className="text-xs text-slate-500 bg-white rounded-lg p-2 border border-slate-200">
                  💊 En el POS aparecerán dos botones: <strong>Caja completa</strong> ({fmt(Number(form.sale_price) || 0)}) y{' '}
                  <strong>1 {form.nombre_fraccion || 'unidad'}</strong> ({fmt((Number(form.sale_price) || 0) / uPorE)})
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}
              className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
