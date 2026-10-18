'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtStock, fmtUnidades } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { Product, CartItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Trash2, ShoppingCart, CheckCircle, Plus, Minus, Barcode, Package, Pill, Printer, Lock, Ban, X } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { loadPrinterConfig, printTicket, type TicketData } from '@/lib/ticket'
import { useBranding } from '@/context/BrandingContext'

// CartItem extended to track unit price and mode
interface CartItemExt extends CartItem {
  unit_price: number   // precio real por unidad vendida (puede ser fraccion)
  is_fraccion: boolean // true = se vendió como fracción individual
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [barcode, setBarcode] = useState('')
  const [cart, setCart] = useState<CartItemExt[]>([])
  const [payMethod, setPayMethod] = useState('efectivo')
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [barcodeMsg, setBarcodeMsg] = useState('')
  const [registerId, setRegisterId] = useState<string | null | undefined>(undefined) // undefined = cargando
  const [saleError, setSaleError] = useState('')
  const [lastTicket, setLastTicket] = useState<TicketData | null>(null)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const [lastSaleAt, setLastSaleAt] = useState<number | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidPin, setVoidPin] = useState('')
  const [voidError, setVoidError] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [voidedMsg, setVoidedMsg] = useState('')
  const { profile } = useAuth()
  const { settings: brand } = useBranding()
  const barcodeRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProducts()
    fetchRegister()
    barcodeRef.current?.focus()
  }, [])

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

  // Adds product to cart as FULL BOX (1 caja) or as a SINGLE FRACTION
  function addToCart(product: Product, asFraccion = false) {
    const uPorE = product.unidades_por_envase ?? 1
    const canFraccionar = uPorE > 1

    // qty in stock units (fraccion = 1/uPorE of a caja)
    const qty = asFraccion ? (1 / uPorE) : 1
    const unitPrice = asFraccion
      ? product.sale_price / uPorE
      : product.sale_price

    const cartKey = `${product.id}_${asFraccion ? 'f' : 'c'}`

    setCart(prev => {
      const exists = prev.find(i => i.product.id === product.id && i.is_fraccion === asFraccion)
      if (exists) {
        const newQty = parseFloat((exists.quantity + qty).toFixed(4))
        return prev.map(i =>
          i.product.id === product.id && i.is_fraccion === asFraccion
            ? { ...i, quantity: newQty, subtotal: parseFloat((newQty * product.sale_price).toFixed(2)) }
            : i
        )
      }
      return [...prev, {
        product,
        quantity: qty,
        subtotal: parseFloat((qty * product.sale_price).toFixed(2)),
        unit_price: unitPrice,
        is_fraccion: asFraccion,
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
    } else {
      setBarcodeMsg('⚠ Código no encontrado')
      setTimeout(() => setBarcodeMsg(''), 2000)
      setBarcode('')
    }
    barcodeRef.current?.focus()
  }

  function updateQty(productId: string, isFraccion: boolean, delta: number) {
    setCart(prev =>
      prev
        .map(i => {
          if (i.product.id !== productId || i.is_fraccion !== isFraccion) return i
          const newQty = parseFloat((i.quantity + delta).toFixed(4))
          const uPorE = i.product.unidades_por_envase ?? 1
          return { ...i, quantity: newQty, subtotal: parseFloat((newQty * i.product.sale_price).toFixed(2)) }
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
        const uPorE = i.product.unidades_por_envase ?? 1
        return { ...i, quantity: qty, subtotal: parseFloat((qty * i.product.sale_price).toFixed(2)) }
      }).filter(i => i.quantity > 0)
    )
  }

  function removeItem(productId: string, isFraccion: boolean) {
    setCart(prev => prev.filter(i => !(i.product.id === productId && i.is_fraccion === isFraccion)))
  }

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0)
  const iva = cart.reduce((s, i) => s + i.subtotal * (i.product.iva_rate / 100) / (1 + i.product.iva_rate / 100), 0)
  const total = subtotal

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

    // Sin caja abierta no se puede vender: así toda venta queda dentro de un arqueo
    const regId = await fetchRegister()
    if (!regId) {
      setSaleError('La caja está cerrada. Abrila antes de cobrar.')
      setProcessing(false)
      return
    }

    // La venta se registra en la base "todo junto": venta, líneas, stock y movimientos.
    // Los precios los toma la base, no esta pantalla.
    const { data: result, error } = await supabase.rpc('create_sale', {
      p_items: cart.map(i => ({ product_id: i.product.id, quantity: i.quantity, is_fraccion: i.is_fraccion })),
      p_payment_method: payMethod,
    })

    if (error || !result) {
      setSaleError(error?.message || 'No se pudo registrar la venta. Revisá la conexión e intentá de nuevo.')
      setProcessing(false)
      if (error?.message?.includes('caja')) fetchRegister()
      return
    }

    const sale = result as {
      id: string; invoice_number: number; created_at: string
      total: number; tax: number; neto: number
      lines: { product_id: string; unit_price: number; subtotal: number }[]
    }

    // Ticket
    const ticket: TicketData = {
      invoiceNumber: sale.invoice_number,
      date: new Date(sale.created_at ?? Date.now()),
      items: cart.map((i, idx) => ({
        name: i.product.name,
        qtyLabel: fmtQty(i.quantity, i.is_fraccion, i.product),
        unitPrice: Number(sale.lines[idx]?.unit_price ?? i.unit_price),
        subtotal: Number(sale.lines[idx]?.subtotal ?? i.subtotal),
      })),
      neto: Number(sale.neto),
      iva: Number(sale.tax),
      total: Number(sale.total),
      paymentMethod: payMethod,
      cashier: profile?.name,
    }
    setLastTicket(ticket)
    setLastSaleId(sale.id)
    setLastSaleAt(Date.now())
    setVoidedMsg('')
    const printer = loadPrinterConfig()
    if (printer.autoPrint) printTicket(ticket, brand, printer)

    setCart([])
    setPayMethod('efectivo')
    setProcessing(false)
    setSuccess(true)
    fetchProducts()
    setTimeout(() => {
      setSuccess(false)
      barcodeRef.current?.focus()
    }, 2000)
  }

  // El cajero solo puede pedir la anulación hasta 15 minutos después de cobrar
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
                  const canFraccionar = uPorE > 1
                  const nombreFrac = p.nombre_fraccion ?? 'unidad'
                  return (
                    <div key={p.id} className="rounded-xl overflow-hidden border border-slate-700">
                      {/* Product info row */}
                      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{p.name}</p>
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
                            <span className="text-xs font-bold text-slate-200">{fmt(p.sale_price / uPorE)}</span>
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
                    <div key={`${item.product.id}_${item.is_fraccion}`} className="flex items-center gap-2 py-2.5 border-b border-slate-700 last:border-0">
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
                  )
                })
              )}
            </CardContent>
          </Card>

          <div className="mt-3 space-y-3">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal neto</span><span>{fmt(subtotal - iva)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>IVA</span><span>{fmt(iva)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-700">
                <span className="text-white">TOTAL</span>
                <span className="text-emerald-400">{fmt(total)}</span>
              </div>
            </div>

            <Select value={payMethod} onValueChange={v => setPayMethod(v ?? payMethod)}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="debito">Débito</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="qr">QR / Billetera virtual</SelectItem>
              </SelectContent>
            </Select>

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
                {processing ? 'Procesando...' : `Cobrar ${fmt(total)}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
