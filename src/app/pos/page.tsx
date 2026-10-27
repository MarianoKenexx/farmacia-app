'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtStock, fmtUnidades } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { Product, CartItem, ObraSocial, TIPO_VENTA_LABEL } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Trash2, ShoppingCart, CheckCircle, Plus, Minus, Barcode, Package, Pill, Printer, Lock, Ban, X, HeartPulse, PackagePlus } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { loadPrinterConfig, printTicket, type TicketData } from '@/lib/ticket'
import { useBranding } from '@/context/BrandingContext'

// CartItem extended to track unit price and mode
interface CartItemExt extends CartItem {
  unit_price: number   // precio real por unidad vendida (puede ser fraccion)
  is_fraccion: boolean // true = se vendió como fracción individual
  aplica_cobertura: boolean // si este ítem en particular entra en el descuento de obra social
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [barcode, setBarcode] = useState('')
  const [cart, setCart] = useState<CartItemExt[]>([])
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [barcodeMsg, setBarcodeMsg] = useState('')
  const [registerId, setRegisterId] = useState<string | null | undefined>(undefined) // undefined = cargando
  const [saleError, setSaleError] = useState('')
  const [payMethod, setPayMethod] = useState('efectivo')
  const [lastTicket, setLastTicket] = useState<TicketData | null>(null)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const [lastSaleAt, setLastSaleAt] = useState<number | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidPin, setVoidPin] = useState('')
  const [voidError, setVoidError] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [voidedMsg, setVoidedMsg] = useState('')
  const [obrasSociales, setObrasSociales] = useState<ObraSocial[]>([])
  const [obraSocialId, setObraSocialId] = useState<string>('')
  // El % no es fijo por obra social (varía por producto): se elige acá,
  // prellenado con el % sugerido que se cargó en Configuración.
  const [porcentajeCobertura, setPorcentajeCobertura] = useState<number | null>(null)
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerQuickName, setCustomerQuickName] = useState('')
  const [customerQuickPhone, setCustomerQuickPhone] = useState('')
  const [customerQuickSaving, setCustomerQuickSaving] = useState(false)
  const [quickAdd, setQuickAdd] = useState<{ barcode: string } | null>(null)
  const [quickName, setQuickName] = useState('')
  const [quickLab, setQuickLab] = useState('')
  const [quickPrice, setQuickPrice] = useState('')
  const [quickStock, setQuickStock] = useState('1')
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickError, setQuickError] = useState('')
  const { profile } = useAuth()
  const { settings: brand } = useBranding()
  const barcodeRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProducts()
    fetchRegister()
    fetchObrasSociales()
    barcodeRef.current?.focus()
  }, [])

  async function fetchObrasSociales() {
    const { data } = await supabase.from('obras_sociales').select('*').eq('active', true).order('nombre')
    setObrasSociales(data || [])
  }

  async function buscarClientes(q: string) {
    setCustomerSearch(q)
    if (!q.trim()) { setCustomers([]); return }
    const { data } = await supabase.from('customers').select('id, name, phone').ilike('name', `%${q.trim()}%`).limit(8)
    setCustomers(data || [])
  }

  async function crearClienteRapido() {
    if (!customerQuickName.trim()) return
    setCustomerQuickSaving(true)
    const { data, error } = await supabase.from('customers')
      .insert({ name: customerQuickName.trim(), phone: customerQuickPhone.trim() || null })
      .select('id, name, phone').single()
    setCustomerQuickSaving(false)
    if (error || !data) return
    setCustomerId(data.id)
    setCustomerName(data.name)
    setCustomerSearch('')
    setCustomers([])
    setCustomerQuickName('')
    setCustomerQuickPhone('')
  }

  async function fetchRegister() {
    const { data } = await supabase
      .from('cash_registers')
      .select('id')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
    const id = data?.[0]?.id ?? null
    setRegisterId(id)
    return id as string | null
  }

  async function fetchProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .gt('stock', 0)
      .order('name')
    setProducts(data || [])
  }

  const filtered = search.length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.includes(search)
      )
    : []

  // Precio real de 1 unidad suelta: el que se cargó a mano si existe,
  // si no la división proporcional de la caja (como siempre funcionó).
  function fraccionUnitPrice(product: Product) {
    const uPorE = product.unidades_por_envase ?? 1
    return product.precio_fraccion != null ? product.precio_fraccion : product.sale_price / uPorE
  }

  // Precio "equivalente a 1 caja" según cómo se esté vendiendo — es lo que
  // hay que multiplicar por la cantidad (en unidades de caja) para el
  // subtotal real, tanto si la fracción es proporcional como si no.
  function perBoxUnitPrice(product: Product, isFraccion: boolean) {
    if (!isFraccion) return product.sale_price
    const uPorE = product.unidades_por_envase ?? 1
    return fraccionUnitPrice(product) * uPorE
  }

  // Adds product to cart as FULL BOX (1 caja) or as a SINGLE FRACTION
  function addToCart(product: Product, asFraccion = false) {
    const uPorE = product.unidades_por_envase ?? 1
    const canFraccionar = uPorE > 1

    // qty in stock units (fraccion = 1/uPorE of a caja)
    const qty = asFraccion ? (1 / uPorE) : 1
    const unitPrice = asFraccion
      ? fraccionUnitPrice(product)
      : product.sale_price
    const boxUnitPrice = perBoxUnitPrice(product, asFraccion)

    const cartKey = `${product.id}_${asFraccion ? 'f' : 'c'}`

    setCart(prev => {
      const exists = prev.find(i => i.product.id === product.id && i.is_fraccion === asFraccion)
      if (exists) {
        const newQty = parseFloat((exists.quantity + qty).toFixed(4))
        return prev.map(i =>
          i.product.id === product.id && i.is_fraccion === asFraccion
            ? { ...i, quantity: newQty, subtotal: parseFloat((newQty * boxUnitPrice).toFixed(2)) }
            : i
        )
      }
      return [...prev, {
        product,
        quantity: qty,
        subtotal: parseFloat((qty * boxUnitPrice).toFixed(2)),
        unit_price: unitPrice,
        is_fraccion: asFraccion,
        // Por defecto, solo entran en el descuento de obra social los productos
        // que no son de venta libre. El cajero lo puede cambiar igual, producto por producto.
        aplica_cobertura: product.tipo_venta !== 'libre',
      }]
    })
    setSearch('')
    barcodeRef.current?.focus()
  }

  function handleBarcodeEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = barcode.trim()
    if (!code) return

    const found = products.find(p => p.barcode === code)
    if (found) {
      addToCart(found, false)
      setBarcode('')
      setBarcodeMsg(`✓ ${found.name}`)
      setTimeout(() => setBarcodeMsg(''), 2000)
      barcodeRef.current?.focus()
    } else {
      // Código nuevo: se carga una sola vez y queda guardado para la próxima
      setQuickAdd({ barcode: code })
      setQuickName('')
      setQuickLab('')
      setQuickPrice('')
      setQuickStock('1')
      setQuickError('')
      setBarcode('')
    }
  }

  async function handleQuickAddSave() {
    if (!quickAdd) return
    setQuickError('')
    if (!quickName.trim()) { setQuickError('Escribí el nombre del producto.'); return }
    const price = Number(quickPrice)
    if (!price || price <= 0) { setQuickError('Escribí un precio de venta válido.'); return }
    const stock = Number(quickStock)
    if (isNaN(stock) || stock < 0) { setQuickError('La cantidad tiene que ser 0 o más.'); return }
    setQuickSaving(true)
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: quickName.trim(),
        barcode: quickAdd.barcode,
        laboratory: quickLab.trim() || null,
        purchase_price: 0,
        sale_price: price,
        stock,
        min_stock: 5,
        iva_rate: 21,
        active: true,
        tipo_venta: 'libre',
      })
      .select('*')
      .single()
    setQuickSaving(false)
    if (error || !data) {
      setQuickError(error?.message || 'No se pudo guardar. Pedile a un administrador que lo cargue.')
      return
    }
    setProducts(prev => [...prev, data as Product])
    setQuickAdd(null)
    setBarcodeMsg(`✓ ${data.name} (cargado)`)
    setTimeout(() => setBarcodeMsg(''), 2500)
    if (stock > 0) addToCart(data as Product, false)
    barcodeRef.current?.focus()
  }

  function updateQty(productId: string, isFraccion: boolean, delta: number) {
    setCart(prev =>
      prev
        .map(i => {
          if (i.product.id !== productId || i.is_fraccion !== isFraccion) return i
          const newQty = parseFloat((i.quantity + delta).toFixed(4))
          const boxUnitPrice = perBoxUnitPrice(i.product, i.is_fraccion)
          return { ...i, quantity: newQty, subtotal: parseFloat((newQty * boxUnitPrice).toFixed(2)) }
        })
        .filter(i => i.quantity > 0)
    )
  }

  function setQtyDirect(productId: string, isFraccion: boolean, raw: string) {
    const val = raw.replace(',', '.')
    setCart(prev =>
      prev.map(i => {
        if (i.product.id !== productId || i.is_fraccion !== isFraccion) return i
        const qty = parseFloat(val)
        if (isNaN(qty) || qty <= 0) return { ...i, quantity: 0 }
        const boxUnitPrice = perBoxUnitPrice(i.product, i.is_fraccion)
        return { ...i, quantity: qty, subtotal: parseFloat((qty * boxUnitPrice).toFixed(2)) }
      }).filter(i => i.quantity > 0)
    )
  }

  function removeItem(productId: string, isFraccion: boolean) {
    setCart(prev => prev.filter(i => !(i.product.id === productId && i.is_fraccion === isFraccion)))
  }

  function toggleCobertura(productId: string, isFraccion: boolean) {
    setCart(prev => prev.map(i =>
      i.product.id === productId && i.is_fraccion === isFraccion
        ? { ...i, aplica_cobertura: !i.aplica_cobertura }
        : i
    ))
  }

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0)
  const iva = cart.reduce((s, i) => s + i.subtotal * (i.product.iva_rate / 100) / (1 + i.product.iva_rate / 100), 0)
  const obraSocial = obrasSociales.find(o => o.id === obraSocialId) || null
  const pctAplicado = porcentajeCobertura ?? obraSocial?.porcentaje_cobertura ?? 0
  const baseCobertura = cart.filter(i => i.aplica_cobertura).reduce((s, i) => s + i.subtotal, 0)
  const coberturaEstimada = obraSocial ? parseFloat((baseCobertura * pctAplicado / 100).toFixed(2)) : 0
  const total = subtotal - coberturaEstimada
  const requiereReceta = cart.some(i => i.product.tipo_venta && i.product.tipo_venta !== 'libre')

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  function fmtQty(q: number, isFraccion: boolean, product: Product) {
    const uPorE = product.unidades_por_envase ?? 1
    if (!isFraccion) {
      // Showing in cajas
      return parseFloat(q.toFixed(4)).toString() + ' caja' + (q !== 1 ? 's' : '')
    } else {
      // Showing in fracciones
      const fracciones = Math.round(q * uPorE)
      const nombre = product.nombre_fraccion ?? 'unidad'
      return `${fracciones} ${nombre}${fracciones !== 1 ? 's' : ''}`
    }
  }

  async function handleSale() {
    if (cart.length === 0 || processing) return
    setProcessing(true)
    setSaleError('')

    // Sin caja abierta no se puede cobrar
    const regId = await fetchRegister()
    if (!regId) {
      setSaleError('La caja está cerrada. Abrila antes de cobrar.')
      setProcessing(false)
      return
    }

    const { data: result, error } = await supabase.rpc('create_sale', {
      p_items: cart.map(i => ({
        product_id: i.product.id, quantity: i.quantity, is_fraccion: i.is_fraccion,
        con_cobertura: i.aplica_cobertura,
      })),
      p_payment_method: payMethod,
      p_customer_id: customerId || null,
      p_obra_social_id: obraSocialId || null,
      p_porcentaje_cobertura: obraSocialId ? pctAplicado : null,
    })

    if (error || !result) {
      setSaleError(error?.message || 'No se pudo registrar la venta. Revisá la conexión e intentá de nuevo.')
      setProcessing(false)
      if (error?.message?.includes('caja')) fetchRegister()
      return
    }

    const venta = result as {
      id: string; invoice_number: number; created_at: string
      total: number; tax: number; neto: number
      lines: { product_id: string; unit_price: number; subtotal: number }[]
      valor_cobertura: number; valor_lista: number
    }

    const ticket: TicketData = {
      invoiceNumber: venta.invoice_number,
      date: new Date(venta.created_at ?? Date.now()),
      items: cart.map((i, idx) => ({
        name: i.product.name,
        qtyLabel: fmtQty(i.quantity, i.is_fraccion, i.product),
        unitPrice: Number(venta.lines[idx]?.unit_price ?? i.unit_price),
        subtotal: Number(venta.lines[idx]?.subtotal ?? i.subtotal),
      })),
      neto: Number(venta.neto),
      iva: Number(venta.tax),
      total: Number(venta.total),
      paymentMethod: payMethod,
      cashier: profile?.name,
      obraSocialNombre: obraSocial?.nombre,
      valorCobertura: Number(venta.valor_cobertura) || 0,
    }
    setLastTicket(ticket)
    setLastSaleId(venta.id)
    setLastSaleAt(Date.now())
    setVoidedMsg('')
    const printer = loadPrinterConfig()
    if (printer.autoPrint) printTicket(ticket, brand, printer)

    setCart([])
    setObraSocialId('')
    setPorcentajeCobertura(null)
    setCustomerId('')
    setCustomerName('')
    setCustomerSearch('')
    setCustomers([])
    setPayMethod('efectivo')
    setProcessing(false)
    setSuccess(true)
    fetchProducts()
    setTimeout(() => {
      setSuccess(false)
      barcodeRef.current?.focus()
    }, 2000)
  }

  // El farmacéutico solo puede pedir la anulación hasta 15 minutos después de cobrar
  const VOID_WINDOW_MS = 15 * 60 * 1000
  const canAskVoid = lastSaleId && lastSaleAt && (Date.now() - lastSaleAt) < VOID_WINDOW_MS

  async function handleVoid() {
    if (!lastSaleId) return
    setVoidError('')
    if (!voidReason.trim()) { setVoidError('Indicá el motivo.'); return }
    if (!/^[0-9]{4,6}$/.test(voidPin)) { setVoidError('El PIN del supervisor es de 4 a 6 números.'); return }
    setVoiding(true)
    const { error } = await supabase.rpc('void_sale_with_pin', {
      p_sale_id: lastSaleId, p_reason: voidReason.trim(), p_pin: voidPin,
    })
    setVoiding(false)
    if (error) { setVoidError(error.message); return }
    setVoidOpen(false)
    setVoidReason('')
    setVoidPin('')
    setLastSaleId(null)
    setLastTicket(null)
    setVoidedMsg('Venta anulada. El stock se devolvió solo.')
    fetchProducts()
    setTimeout(() => setVoidedMsg(''), 4000)
  }

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold text-white">Punto de Venta</h1>
        <div className="flex items-center gap-2">
          {voidedMsg && (
            <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> {voidedMsg}</span>
          )}
          {lastTicket && (
            <button
              onClick={() => printTicket({ ...lastTicket, reprint: true }, brand)}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl"
            >
              <Printer className="w-4 h-4" /> Reimprimir último ticket
            </button>
          )}
          {canAskVoid && (
            <button
              onClick={() => { setVoidError(''); setVoidReason(''); setVoidPin(''); setVoidOpen(true) }}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 bg-slate-800 hover:bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-xl"
            >
              <Ban className="w-4 h-4" /> Anular esta venta
            </button>
          )}
        </div>
      </div>

      {/* Anular última venta: pide motivo y el PIN de un supervisor */}
      {voidOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2"><Ban className="w-4 h-4 text-red-400" /> Anular última venta</h2>
              <button onClick={() => setVoidOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">
              Esto devuelve el stock y queda registrado. Necesitás que un supervisor confirme con su PIN.
            </p>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Motivo</p>
              <textarea
                value={voidReason} onChange={e => setVoidReason(e.target.value)}
                rows={2} placeholder="Ej: se cobró mal, el cliente se arrepintió..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">PIN del supervisor</p>
              <input
                type="password" inputMode="numeric" maxLength={6}
                value={voidPin} onChange={e => setVoidPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            {voidError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{voidError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setVoidOpen(false)} className="text-sm text-slate-300 hover:text-white px-3 py-2">Cancelar</button>
              <button
                onClick={handleVoid} disabled={voiding}
                className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {voiding ? 'Anulando...' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Código de barras nuevo: se carga una vez y después se reconoce solo */}
      {quickAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <PackagePlus className="w-4 h-4 text-emerald-400" /> Producto nuevo
              </h2>
              <button onClick={() => setQuickAdd(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">
              El código <span className="font-mono text-slate-300">{quickAdd.barcode}</span> no estaba cargado.
              Completalo una sola vez — la próxima vez que se escanee, el sistema ya lo va a reconocer solo.
            </p>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Nombre del producto</p>
              <input
                autoFocus value={quickName} onChange={e => setQuickName(e.target.value)}
                placeholder="Ej: Ibuprofeno 400 mg x 10"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Laboratorio (opcional)</p>
                <input
                  value={quickLab} onChange={e => setQuickLab(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Precio de venta</p>
                <input
                  type="number" value={quickPrice} onChange={e => setQuickPrice(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Cantidad que estás cargando ahora</p>
              <input
                type="number" value={quickStock} onChange={e => setQuickStock(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-500 mt-1">Si ponés más de 0, se agrega directo al carrito para vender ahora.</p>
            </div>
            {quickError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{quickError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setQuickAdd(null)} className="text-sm text-slate-300 hover:text-white px-3 py-2">Cancelar</button>
              <button
                onClick={handleQuickAddSave} disabled={quickSaving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {quickSaving ? 'Guardando...' : 'Guardar y usar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {registerId === null && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> La caja está cerrada. Para cobrar, primero hay que abrirla.</span>
          <Link href="/caja" className="font-semibold underline underline-offset-2 hover:text-amber-200">Ir a Caja</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
        {/* Panel izquierdo */}
        <div className="space-y-3">

          {/* Scan con Enter */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Barcode className="w-3.5 h-3.5" /> Escáner de código de barras
            </p>
            <div className="relative">
              <input
                ref={barcodeRef}
                type="text"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={handleBarcodeEnter}
                placeholder="Escanear o escribir código y Enter..."
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            {barcodeMsg && (
              <p className={`text-xs mt-1.5 font-medium ${barcodeMsg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {barcodeMsg}
              </p>
            )}
          </div>

          {/* Búsqueda por nombre */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> Buscar por nombre
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Escribir nombre del producto..."
                className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            {filtered.length > 0 && (
              <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                {filtered.slice(0, 10).map(p => {
                  const uPorE = p.unidades_por_envase ?? 1
                  // Un medicamento bajo receta (o archivada) nunca se fracciona,
                  // aunque haya quedado algún dato viejo con unidades por caja > 1.
                  const canFraccionar = uPorE > 1 && p.tipo_venta === 'libre'
                  const nombreFrac = p.nombre_fraccion ?? 'unidad'
                  return (
                    <div key={p.id} className="rounded-xl overflow-hidden border border-slate-700">
                      {/* Product info row */}
                      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-white truncate">{p.name}</p>
                            {p.tipo_venta && p.tipo_venta !== 'libre' && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-400 rounded px-1.5 py-0.5 flex-shrink-0">
                                {TIPO_VENTA_LABEL[p.tipo_venta]}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{p.laboratory || p.barcode || '—'}</p>
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          <p className="text-xs text-slate-500">Stock: {fmtStock(p.stock)} caja{Number(p.stock) !== 1 ? 's' : ''}</p>
                          {canFraccionar && (
                            <p className="text-xs text-slate-500">{fmtUnidades(p.stock, uPorE)} {nombreFrac}s</p>
                          )}
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className={`px-2 pb-2 grid gap-1.5 ${canFraccionar ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button
                          onClick={() => addToCart(p, false)}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-emerald-200" />
                            <span className="text-xs font-semibold text-white">Caja completa</span>
                          </div>
                          <span className="text-xs font-bold text-emerald-100">{fmt(p.sale_price)}</span>
                        </button>
                        {canFraccionar && (
                          <button
                            onClick={() => addToCart(p, true)}
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-800 transition-colors text-left"
                          >
                            <div className="flex items-center gap-1.5">
                              <Pill className="w-3.5 h-3.5 text-slate-300" />
                              <span className="text-xs font-semibold text-white">1 {nombreFrac}</span>
                            </div>
                            <span className="text-xs font-bold text-slate-200">{fmt(fraccionUnitPrice(p))}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {search.length > 0 && filtered.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-3">Sin resultados para "{search}"</p>
            )}
          </div>
        </div>

        {/* Carrito */}
        <div className="flex flex-col">
          <Card className="flex-1 flex flex-col overflow-hidden bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <ShoppingCart className="w-4 h-4" />
                Carrito
                {cart.length > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-0">{cart.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-0 pb-2">
              {cart.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">
                  Escanear o buscar un producto para agregar
                </p>
              ) : (
                cart.map(item => {
                  const uPorE = item.product.unidades_por_envase ?? 1
                  const nombreFrac = item.product.nombre_fraccion ?? 'unidad'
                  const deltaQty = item.is_fraccion ? (1 / uPorE) : 1
                  return (
                    <div key={`${item.product.id}_${item.is_fraccion}`} className="py-2.5 border-b border-slate-700 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-white truncate">{item.product.name}</p>
                            {item.is_fraccion
                              ? <span className="text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5 flex-shrink-0">{nombreFrac}</span>
                              : <span className="text-xs bg-emerald-900/50 text-emerald-400 rounded px-1.5 py-0.5 flex-shrink-0">caja</span>
                            }
                          </div>
                          <p className="text-xs text-slate-400">{fmt(item.unit_price)} c/u</p>
                        </div>

                        {/* Controles de cantidad */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-7 h-7 p-0 border-slate-600 text-white hover:bg-slate-700"
                            onClick={() => updateQty(item.product.id, item.is_fraccion, -deltaQty)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>

                          <div className="w-16 text-center text-xs font-bold text-white bg-slate-900 border border-slate-600 rounded-lg px-1 py-1">
                            {fmtQty(item.quantity, item.is_fraccion, item.product)}
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            className="w-7 h-7 p-0 border-slate-600 text-white hover:bg-slate-700"
                            onClick={() => updateQty(item.product.id, item.is_fraccion, deltaQty)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>

                        <p className="text-sm font-bold w-20 text-right text-emerald-400 flex-shrink-0">
                          {fmt(item.subtotal)}
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-1 flex-shrink-0"
                          onClick={() => removeItem(item.product.id, item.is_fraccion)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {obraSocialId && (
                        <label className="flex items-center gap-1.5 mt-1.5 pl-0.5 cursor-pointer select-none w-fit">
                          <input
                            type="checkbox"
                            checked={item.aplica_cobertura}
                            onChange={() => toggleCobertura(item.product.id, item.is_fraccion)}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 accent-emerald-500"
                          />
                          <span className="text-xs text-slate-400">
                            Con cobertura de {obraSocial?.nombre}
                          </span>
                        </label>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <div className="mt-3 space-y-3">
            {requiereReceta && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-3 py-2 text-xs">
                <HeartPulse className="w-4 h-4 flex-shrink-0" />
                Hay productos que requieren receta. Pedila antes de cobrar.
              </div>
            )}

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 relative">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cliente (opcional)</p>
              {customerId ? (
                <div className="flex items-center justify-between bg-slate-900 rounded-xl px-3 py-2">
                  <span className="text-sm text-white">{customerName}</span>
                  <button onClick={() => { setCustomerId(''); setCustomerName('') }} className="text-xs text-slate-400 hover:text-slate-200">quitar</button>
                </div>
              ) : (
                <>
                  <Input
                    value={customerSearch}
                    onChange={e => buscarClientes(e.target.value)}
                    placeholder="Buscar cliente por nombre..."
                    className="bg-slate-900 border-slate-700 text-white placeholder-slate-500"
                  />
                  {customerSearch.trim() && (
                    <div className="absolute z-10 left-4 right-4 bg-slate-900 border border-slate-700 rounded-xl mt-1 overflow-hidden">
                      {customers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(''); setCustomers([]) }}
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-800"
                        >
                          {c.name}{c.phone ? ` · ${c.phone}` : ''}
                        </button>
                      ))}
                      <div className="border-t border-slate-700 p-2 space-y-1.5">
                        <p className="text-xs text-slate-500">¿No está? Cargalo rápido:</p>
                        <div className="flex gap-1.5">
                          <Input value={customerQuickName} onChange={e => setCustomerQuickName(e.target.value)} placeholder="Nombre" className="bg-slate-800 border-slate-700 text-white text-xs h-8" />
                          <Input value={customerQuickPhone} onChange={e => setCustomerQuickPhone(e.target.value)} placeholder="Tel." className="bg-slate-800 border-slate-700 text-white text-xs h-8 w-24" />
                          <Button size="sm" disabled={!customerQuickName.trim() || customerQuickSaving} onClick={crearClienteRapido} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 shrink-0">
                            {customerQuickSaving ? '...' : 'Agregar'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {customerId && (
                <p className="text-xs text-slate-500 mt-1.5">Así queda asociada la venta para recordatorios de recompra y, si hace falta, para fiarla.</p>
              )}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cobertura (opcional)</p>
              <Select
                value={obraSocialId || 'none'}
                onValueChange={v => {
                  const id = !v || v === 'none' ? '' : v
                  setObraSocialId(id)
                  // Prellenamos con el % sugerido de esa obra social, pero se puede
                  // cambiar al lado — el mismo producto cubre distinto según el caso.
                  const o = obrasSociales.find(x => x.id === id)
                  setPorcentajeCobertura(o ? o.porcentaje_cobertura : null)
                }}
              >
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-full">
                  <span>{obraSocial ? obraSocial.nombre : 'Sin obra social'}</span>
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="none">Sin obra social</SelectItem>
                  {obrasSociales.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {obraSocial && (
                <Select
                  value={String(pctAplicado)}
                  onValueChange={v => setPorcentajeCobertura(Number(v))}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-full">
                    <span>{pctAplicado}% de cobertura</span>
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(p => (
                      <SelectItem key={p} value={String(p)}>{p}%{p === obraSocial.porcentaje_cobertura ? ' (sugerido)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Método de pago</p>
              <Select value={payMethod} onValueChange={v => setPayMethod(v || 'efectivo')}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="qr">QR</SelectItem>
                  {customerId && <SelectItem value="fiado">Fiado</SelectItem>}
                </SelectContent>
              </Select>
              {payMethod === 'fiado' && (
                <p className="text-xs text-amber-400">
                  Queda a cuenta de {customerName}. No suma al efectivo de la caja.
                </p>
              )}
            </div>

            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal neto</span><span>{fmt(subtotal - iva)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>IVA</span><span>{fmt(iva)}</span>
              </div>
              {obraSocial && (
                <div className="flex justify-between text-amber-400">
                  <span>Cobertura {obraSocial.nombre}</span><span>-{fmt(coberturaEstimada)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-700">
                <span className="text-white">A COBRAR</span>
                <span className="text-emerald-400">{fmt(total)}</span>
              </div>
              {obraSocial && (
                <p className="text-xs text-slate-500">
                  Queda registrado para reclamarle {fmt(coberturaEstimada)} a {obraSocial.nombre} más adelante.
                </p>
              )}
            </div>

            {saleError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{saleError}</p>
            )}

            {success ? (
              <Button className="w-full bg-emerald-500 text-white gap-2 py-6" disabled>
                <CheckCircle className="w-5 h-5" /> ¡Venta registrada!
              </Button>
            ) : (
              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white text-base py-6 font-semibold shadow-lg shadow-emerald-500/20"
                onClick={handleSale}
                disabled={cart.length === 0 || processing || registerId === null}
              >
                {processing ? 'Cobrando...' : `Cobrar ${fmt(total)}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
