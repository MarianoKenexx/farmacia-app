'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ObraSocial } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Receipt, Clock, User, CheckCircle, Ban, X, Lock, Check } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useBranding } from '@/context/BrandingContext'
import { loadPrinterConfig, printTicket, METODO_LABEL, type TicketData } from '@/lib/ticket'

interface ComandaResumen {
  id: string
  invoice_number: number
  created_at: string
  total: number
  customer_name: string | null
  items_count: number
}

interface ComandaLine {
  product_id: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
  con_cobertura: boolean
  is_fraccion: boolean
  unidades_por_envase: number | null
  nombre_fraccion: string | null
}

interface ComandaDetalle {
  id: string
  invoice_number: number
  created_at: string
  customer_id: string | null
  customer_name: string | null
  obra_social_id: string | null
  obra_social_nombre: string | null
  porcentaje_cobertura: number | null
  total: number
  valor_cobertura: number
  lines: ComandaLine[]
}

export default function CobrosPage() {
  const [pendientes, setPendientes] = useState<ComandaResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [registerOpen, setRegisterOpen] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<ComandaDetalle | null>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [detalleError, setDetalleError] = useState('')

  // Ajustes editables en caja
  const [obrasSociales, setObrasSociales] = useState<ObraSocial[]>([])
  const [obraSocialId, setObraSocialId] = useState<string>('')
  const [porcentajeCobertura, setPorcentajeCobertura] = useState<number | null>(null)
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [payMethod, setPayMethod] = useState('efectivo')
  const [cobrando, setCobrando] = useState(false)
  const [cobroError, setCobroError] = useState('')
  const [cobradoMsg, setCobradoMsg] = useState('')

  // Cobro rápido: checkbox en la tarjeta, sin abrir el detalle completo
  const [quickId, setQuickId] = useState<string | null>(null)
  const [quickDetail, setQuickDetail] = useState<ComandaDetalle | null>(null)
  const [quickMethod, setQuickMethod] = useState('efectivo')
  const [quickLoading, setQuickLoading] = useState(false)
  const [quickError, setQuickError] = useState('')

  // Anulación
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidPin, setVoidPin] = useState('')
  const [voidError, setVoidError] = useState('')
  const [voiding, setVoiding] = useState(false)

  const { profile } = useAuth()
  const { settings: brand } = useBranding()

  useEffect(() => {
    fetchPendientes()
    fetchObrasSociales()
  }, [])

  async function fetchObrasSociales() {
    const { data } = await supabase.from('obras_sociales').select('*').eq('active', true).order('nombre')
    setObrasSociales(data || [])
  }

  async function fetchPendientes() {
    setLoading(true)
    const { data: reg } = await supabase.from('cash_registers').select('id').eq('status', 'open').limit(1)
    setRegisterOpen(!!reg?.[0])
    const { data, error } = await supabase.rpc('listar_comandas_pendientes')
    if (!error) setPendientes((data as ComandaResumen[]) || [])
    setLoading(false)
  }

  async function abrirComanda(id: string) {
    setDetalleError('')
    setCobroError('')
    setLoadingDetalle(true)
    const { data, error } = await supabase.rpc('detalle_comanda', { p_sale_id: id })
    setLoadingDetalle(false)
    if (error || !data) {
      setDetalleError(error?.message || 'No se pudo abrir la comanda.')
      return
    }
    const d = data as ComandaDetalle
    setSelected(d)
    setObraSocialId(d.obra_social_id || '')
    setPorcentajeCobertura(d.porcentaje_cobertura ?? null)
    setCustomerId(d.customer_id || '')
    setCustomerName(d.customer_name || '')
    setCustomerSearch('')
    setCustomers([])
    setPayMethod('efectivo')
  }

  function cerrarDetalle() {
    setSelected(null)
    setCobroError('')
  }

  async function buscarClientes(q: string) {
    setCustomerSearch(q)
    if (!q.trim()) { setCustomers([]); return }
    const { data } = await supabase.from('customers').select('id, name, phone').ilike('name', `%${q.trim()}%`).limit(8)
    setCustomers(data || [])
  }

  const obraSocial = obrasSociales.find(o => o.id === obraSocialId) || null
  const pctAplicado = porcentajeCobertura ?? obraSocial?.porcentaje_cobertura ?? 0

  // Recalcula el total estimado en pantalla si se cambia la obra social/%
  // respecto de lo que ya quedó guardado al despachar (solo para mostrar;
  // el valor final definitivo lo calcula cobrar_comanda en el servidor).
  const baseCobertura = selected ? selected.lines.filter(l => l.con_cobertura).reduce((s, l) => s + l.subtotal, 0) : 0
  const valorLista = selected ? selected.lines.reduce((s, l) => s + l.subtotal, 0) : 0
  const coberturaEstimada = obraSocial ? parseFloat((baseCobertura * pctAplicado / 100).toFixed(2)) : 0
  const totalEstimado = valorLista - coberturaEstimada

  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  async function handleCobrar() {
    if (!selected || cobrando) return
    setCobroError('')
    if (payMethod === 'fiado' && !customerId) {
      setCobroError('Para fiar hace falta elegir un cliente.')
      return
    }
    setCobrando(true)
    const { data: result, error } = await supabase.rpc('cobrar_comanda', {
      p_sale_id: selected.id,
      p_payment_method: payMethod,
      p_customer_id: customerId || null,
      p_obra_social_id: obraSocialId || null,
      p_porcentaje_cobertura: obraSocialId ? pctAplicado : null,
    })
    setCobrando(false)
    if (error || !result) {
      setCobroError(error?.message || 'No se pudo cobrar la comanda.')
      return
    }
    const r = result as { id: string; invoice_number: number; created_at: string; total: number; tax: number; neto: number; valor_cobertura: number }

    const ticket: TicketData = {
      invoiceNumber: r.invoice_number,
      date: new Date(r.created_at ?? Date.now()),
      items: selected.lines.map(l => ({
        name: l.name,
        qtyLabel: l.is_fraccion
          ? `${Math.round(l.quantity * (l.unidades_por_envase || 1))} ${l.nombre_fraccion || 'unidad'}${Math.round(l.quantity * (l.unidades_por_envase || 1)) !== 1 ? 's' : ''}`
          : `${parseFloat(l.quantity.toFixed(4))} caja${l.quantity !== 1 ? 's' : ''}`,
        unitPrice: l.unit_price,
        subtotal: l.subtotal,
      })),
      neto: Number(r.neto),
      iva: Number(r.tax),
      total: Number(r.total),
      paymentMethod: payMethod,
      cashier: profile?.name,
      obraSocialNombre: obraSocial?.nombre,
      valorCobertura: Number(r.valor_cobertura) || 0,
    }
    const printer = loadPrinterConfig()
    if (printer.autoPrint) printTicket(ticket, brand, printer)

    setCobradoMsg(`Comanda #${r.invoice_number} cobrada (${METODO_LABEL[payMethod] ?? payMethod}).`)
    setTimeout(() => setCobradoMsg(''), 4000)
    setSelected(null)
    fetchPendientes()
  }

  // Checkbox rápido: trae el detalle de la comanda (cliente/obra social
  // ya asociados, sin tocarlos) para poder cobrarla con un par de clics,
  // sin pasar por el cuadro completo.
  async function abrirCobroRapido(c: ComandaResumen) {
    setQuickError('')
    setQuickId(c.id)
    setQuickDetail(null)
    setQuickLoading(true)
    const { data, error } = await supabase.rpc('detalle_comanda', { p_sale_id: c.id })
    setQuickLoading(false)
    if (error || !data) {
      setQuickError(error?.message || 'No se pudo abrir la comanda.')
      return
    }
    const d = data as ComandaDetalle
    setQuickDetail(d)
    setQuickMethod('efectivo')
  }

  function cancelarCobroRapido() {
    setQuickId(null)
    setQuickDetail(null)
    setQuickError('')
  }

  async function confirmarCobroRapido() {
    if (!quickDetail || quickLoading) return
    setQuickError('')
    if (quickMethod === 'fiado' && !quickDetail.customer_id) {
      setQuickError('Para fiar hace falta un cliente asociado a la comanda.')
      return
    }
    setQuickLoading(true)
    const { data: result, error } = await supabase.rpc('cobrar_comanda', {
      p_sale_id: quickDetail.id,
      p_payment_method: quickMethod,
      p_customer_id: quickDetail.customer_id || null,
      p_obra_social_id: quickDetail.obra_social_id || null,
      p_porcentaje_cobertura: quickDetail.porcentaje_cobertura,
    })
    setQuickLoading(false)
    if (error || !result) {
      setQuickError(error?.message || 'No se pudo cobrar la comanda.')
      return
    }
    const r = result as { id: string; invoice_number: number; created_at: string; total: number; tax: number; neto: number; valor_cobertura: number }

    const ticket: TicketData = {
      invoiceNumber: r.invoice_number,
      date: new Date(r.created_at ?? Date.now()),
      items: quickDetail.lines.map(l => ({
        name: l.name,
        qtyLabel: l.is_fraccion
          ? `${Math.round(l.quantity * (l.unidades_por_envase || 1))} ${l.nombre_fraccion || 'unidad'}${Math.round(l.quantity * (l.unidades_por_envase || 1)) !== 1 ? 's' : ''}`
          : `${parseFloat(l.quantity.toFixed(4))} caja${l.quantity !== 1 ? 's' : ''}`,
        unitPrice: l.unit_price,
        subtotal: l.subtotal,
      })),
      neto: Number(r.neto),
      iva: Number(r.tax),
      total: Number(r.total),
      paymentMethod: quickMethod,
      cashier: profile?.name,
      obraSocialNombre: quickDetail.obra_social_nombre || undefined,
      valorCobertura: Number(r.valor_cobertura) || 0,
    }
    const printer = loadPrinterConfig()
    if (printer.autoPrint) printTicket(ticket, brand, printer)

    setCobradoMsg(`Comanda #${r.invoice_number} cobrada (${METODO_LABEL[quickMethod] ?? quickMethod}).`)
    setTimeout(() => setCobradoMsg(''), 4000)
    setQuickId(null)
    setQuickDetail(null)
    fetchPendientes()
  }

  async function handleVoid() {
    if (!selected) return
    setVoidError('')
    if (!voidReason.trim()) { setVoidError('Indicá el motivo.'); return }
    if (!/^[0-9]{4,6}$/.test(voidPin)) { setVoidError('El PIN del supervisor es de 4 a 6 números.'); return }
    setVoiding(true)
    const { error } = await supabase.rpc('anular_comanda_with_pin', {
      p_sale_id: selected.id, p_reason: voidReason.trim(), p_pin: voidPin,
    })
    setVoiding(false)
    if (error) { setVoidError(error.message); return }
    setVoidOpen(false)
    setVoidReason('')
    setVoidPin('')
    setSelected(null)
    setCobradoMsg('Comanda anulada. El stock se devolvió solo.')
    setTimeout(() => setCobradoMsg(''), 4000)
    fetchPendientes()
  }

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold text-white">Cobros</h1>
        {cobradoMsg && (
          <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> {cobradoMsg}</span>
        )}
      </div>

      {registerOpen === false && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> La caja está cerrada. Para cobrar comandas, primero hay que abrirla.</span>
          <Link href="/caja" className="font-semibold underline underline-offset-2 hover:text-amber-200">Ir a Caja</Link>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Cargando...</p>
      ) : pendientes.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center">
          <Receipt className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No hay comandas pendientes de cobro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pendientes.map(c => {
            const quickOpen = quickId === c.id
            return (
              <div
                key={c.id}
                className={`bg-slate-800 border rounded-2xl p-4 transition-colors ${quickOpen ? 'border-emerald-500/60' : 'border-slate-700 hover:border-emerald-500/50 hover:bg-slate-700/60'}`}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => quickOpen ? cancelarCobroRapido() : abrirCobroRapido(c)}
                    title="Marcar como cobrada"
                    className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${quickOpen ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-emerald-500'}`}
                  >
                    {quickOpen && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                  <button onClick={() => abrirComanda(c.id)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white">Comanda #{c.invoice_number}</span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(c.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {c.customer_name && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mb-1"><User className="w-3 h-3" /> {c.customer_name}</p>
                    )}
                    <p className="text-xs text-slate-500 mb-2">{c.items_count} ítem{c.items_count !== 1 ? 's' : ''}</p>
                    <p className="text-lg font-bold text-emerald-400">{fmt(c.total)}</p>
                  </button>
                </div>

                {quickOpen && (
                  <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                    {quickLoading && !quickDetail ? (
                      <p className="text-xs text-slate-500">Cargando...</p>
                    ) : (
                      <>
                        <Select
                          value={quickMethod}
                          onValueChange={v => {
                            const next = v ?? quickMethod
                            setQuickMethod(next === 'fiado' && !quickDetail?.customer_id ? 'efectivo' : next)
                          }}
                        >
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-9 text-sm">
                            <span>{METODO_LABEL[quickMethod] ?? quickMethod}</span>
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="debito">Débito</SelectItem>
                            <SelectItem value="credito">Crédito</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="qr">QR / Billetera virtual</SelectItem>
                            {quickDetail?.customer_id && <SelectItem value="fiado">Fiado</SelectItem>}
                          </SelectContent>
                        </Select>
                        {quickError && (
                          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1.5">{quickError}</p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={cancelarCobroRapido} className="flex-1 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg py-2">
                            Cancelar
                          </button>
                          <button
                            onClick={confirmarCobroRapido}
                            disabled={quickLoading}
                            className="flex-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg py-2"
                          >
                            {quickLoading ? 'Cobrando...' : 'Confirmar cobro'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {detalleError && (
        <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{detalleError}</p>
      )}

      {/* Panel de cobro */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" /> Comanda #{selected.invoice_number}
              </h2>
              <button onClick={cerrarDetalle} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-700 divide-y divide-slate-800">
              {selected.lines.map((l, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-white truncate">{l.name}</p>
                    <p className="text-xs text-slate-500">
                      {l.is_fraccion
                        ? `${Math.round(l.quantity * (l.unidades_por_envase || 1))} ${l.nombre_fraccion || 'unidad'}${Math.round(l.quantity * (l.unidades_por_envase || 1)) !== 1 ? 's' : ''}`
                        : `${parseFloat(l.quantity.toFixed(4))} caja${l.quantity !== 1 ? 's' : ''}`} x {fmt(l.unit_price)}
                    </p>
                  </div>
                  <p className="text-emerald-400 font-semibold flex-shrink-0 ml-2">{fmt(l.subtotal)}</p>
                </div>
              ))}
            </div>

            {/* Cliente */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 relative">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cliente</p>
              {customerId ? (
                <div className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                  <span className="text-sm text-white">{customerName}</span>
                  <button
                    onClick={() => { setCustomerId(''); setCustomerName(''); if (payMethod === 'fiado') setPayMethod('efectivo') }}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >quitar</button>
                </div>
              ) : (
                <>
                  <Input
                    value={customerSearch}
                    onChange={e => buscarClientes(e.target.value)}
                    placeholder="Buscar cliente por nombre..."
                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                  />
                  {customerSearch.trim() && customers.length > 0 && (
                    <div className="absolute z-10 left-3 right-3 bg-slate-800 border border-slate-700 rounded-xl mt-1 overflow-hidden">
                      {customers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(''); setCustomers([]) }}
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700"
                        >
                          {c.name}{c.phone ? ` · ${c.phone}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Obra social */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Cobertura</p>
              <Select
                value={obraSocialId || 'none'}
                onValueChange={v => {
                  const id = !v || v === 'none' ? '' : v
                  setObraSocialId(id)
                  const o = obrasSociales.find(x => x.id === id)
                  setPorcentajeCobertura(o ? o.porcentaje_cobertura : null)
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-full">
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
                <Select value={String(pctAplicado)} onValueChange={v => setPorcentajeCobertura(Number(v))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-full">
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

            {/* Método de pago */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Método de pago</p>
              <Select
                value={payMethod}
                onValueChange={v => {
                  const next = v ?? payMethod
                  setPayMethod(next === 'fiado' && !customerId ? 'efectivo' : next)
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <span>{METODO_LABEL[payMethod] ?? payMethod}</span>
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="qr">QR / Billetera virtual</SelectItem>
                  {customerId && <SelectItem value="fiado">Fiado</SelectItem>}
                </SelectContent>
              </Select>
              {payMethod === 'fiado' && (
                <p className="text-xs text-amber-400">Queda a cuenta de {customerName}. No suma al efectivo de la caja.</p>
              )}
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-700 p-3 space-y-1.5 text-sm">
              {obraSocial && (
                <div className="flex justify-between text-amber-400">
                  <span>Cobertura {obraSocial.nombre}</span><span>-{fmt(coberturaEstimada)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1">
                <span className="text-white">TOTAL A COBRAR</span>
                <span className="text-emerald-400">{fmt(totalEstimado)}</span>
              </div>
            </div>

            {cobroError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{cobroError}</p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => { setVoidError(''); setVoidReason(''); setVoidPin(''); setVoidOpen(true) }}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 bg-slate-900 hover:bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-xl"
              >
                <Ban className="w-4 h-4" /> Anular
              </button>
              <Button
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-5"
                onClick={handleCobrar}
                disabled={cobrando}
              >
                {cobrando ? 'Cobrando...' : `Cobrar ${fmt(totalEstimado)}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Anular comanda: pide motivo y PIN de un supervisor */}
      {voidOpen && selected && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2"><Ban className="w-4 h-4 text-red-400" /> Anular comanda #{selected.invoice_number}</h2>
              <button onClick={() => setVoidOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">
              Esto devuelve el stock y queda registrado. Necesitás que un supervisor confirme con su PIN.
            </p>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Motivo</p>
              <textarea
                value={voidReason} onChange={e => setVoidReason(e.target.value)}
                rows={2} placeholder="Ej: el cliente se arrepintió, quedó mal despachada..."
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
    </div>
  )
}
