'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CashRegister, Sale, CashWithdrawal } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LockOpen, Lock, DollarSign, TrendingUp, Printer, CheckCircle, Banknote, Receipt } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useBranding } from '@/context/BrandingContext'
import { loadPrinterConfig, printFiadosTicket } from '@/lib/ticket'

export default function CajaPage() {
  const [register, setRegister] = useState<CashRegister | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [withdrawals, setWithdrawals] = useState<CashWithdrawal[]>([])
  const [openAmount, setOpenAmount] = useState('')
  const [closeAmount, setCloseAmount] = useState('')
  const [openDialog, setOpenDialog] = useState(false)
  const [closeDialog, setCloseDialog] = useState(false)
  const [retiroDialog, setRetiroDialog] = useState(false)
  const [retiroMonto, setRetiroMonto] = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [retiroError, setRetiroError] = useState('')
  const [printingFiados, setPrintingFiados] = useState(false)
  const [loading, setLoading] = useState(true)
  const [closedMsg, setClosedMsg] = useState('')
  const [actionError, setActionError] = useState('')
  const [openedByName, setOpenedByName] = useState<string | null>(null)
  const { settings: brand } = useBranding()
  const { profile } = useAuth()
  // Cierre "a ciegas": el cajero no ve cuánto debería haber, solo cuenta y carga el monto.
  const blind = profile?.role === 'cajero'

  useEffect(() => { fetchRegister() }, [])

  async function fetchRegister() {
    setLoading(true)
    const { data: reg } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()

    setRegister(reg || null)
    setOpenedByName(null)
    if (reg?.opened_by) {
      const { data: p } = await supabase.from('profiles').select('name').eq('id', reg.opened_by).maybeSingle()
      setOpenedByName(p?.name ?? null)
    }

    if (reg) {
      const { data: s } = await supabase
        .from('sales')
        .select('*, customers(name)')
        .eq('register_id', reg.id)
        .eq('status', 'completed')
      setSales(s || [])

      const { data: w } = await supabase
        .from('cash_withdrawals')
        .select('*')
        .eq('register_id', reg.id)
        .order('created_at', { ascending: false })
      setWithdrawals(w || [])
    } else {
      setWithdrawals([])
    }
    setLoading(false)
  }

  async function handleRetiro() {
    setRetiroError('')
    const monto = Number(retiroMonto)
    if (!monto || monto <= 0) { setRetiroError('Ingresá un monto válido'); return }
    if (!retiroMotivo.trim()) { setRetiroError('Indicá para qué es el retiro'); return }
    const { error } = await supabase.rpc('retirar_de_caja', { p_monto: monto, p_motivo: retiroMotivo.trim() })
    if (error) { setRetiroError(error.message); return }
    setRetiroDialog(false)
    setRetiroMonto('')
    setRetiroMotivo('')
    fetchRegister()
  }

  // Trae TODOS los fiados del día (de cualquier caja que se haya abierto/cerrado
  // hoy, no solo la que está abierta ahora), para poder imprimirlos al final del día.
  async function handlePrintFiados() {
    setPrintingFiados(true)
    setActionError('')
    try {
      const inicio = new Date()
      inicio.setHours(0, 0, 0, 0)
      const fin = new Date(inicio)
      fin.setDate(fin.getDate() + 1)

      const { data, error } = await supabase
        .from('sales')
        .select('invoice_number, created_at, total, customers(name)')
        .eq('status', 'completed')
        .eq('payment_method', 'fiado')
        .gte('created_at', inicio.toISOString())
        .lt('created_at', fin.toISOString())
        .order('created_at', { ascending: true })

      if (error) { setActionError(error.message); return }

      const rows = (data || []).map(r => {
        const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
        return {
          invoiceNumber: r.invoice_number,
          date: new Date(r.created_at),
          cliente: cust?.name || 'Cliente sin nombre',
          monto: Number(r.total),
        }
      })

      printFiadosTicket(rows, inicio, brand, loadPrinterConfig())
    } finally {
      setPrintingFiados(false)
    }
  }

  async function handleOpen() {
    setActionError('')
    const { error } = await supabase.rpc('open_register', { p_amount: Number(openAmount || 0) })
    if (error) { setActionError(error.message); return }
    setOpenDialog(false)
    setClosedMsg('')
    setOpenAmount('')
    fetchRegister()
  }

  async function handleClose() {
    if (!register) return
    setActionError('')
    const { error } = await supabase.rpc('close_register', { p_amount: Number(closeAmount) })
    if (error) { setActionError(error.message); return }
    // Avisa por mail (si está configurado). No bloquea el cierre si falla.
    fetch('/api/notify-cierre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registerId: register.id }),
    }).catch(() => {})
    setCloseDialog(false)
    setClosedMsg(`Caja cerrada. Monto contado registrado: ${fmt(Number(closeAmount))}`)
    setCloseAmount('')
    setRegister(null)
    setSales([])
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  // Un fiado no es plata que entró: es una promesa de pago. Lo sacamos de
  // "cobrado real" (igual que ya se hace con la cobertura de obra social)
  // y lo mostramos aparte para poder discriminarlo más tarde.
  const fiados = sales.filter(s => s.payment_method === 'fiado')
  const totalFiado = fiados.reduce((s, v) => s + Number(v.total), 0)
  const salesCobradas = sales.filter(s => s.payment_method !== 'fiado')
  const totalVentasTodas = sales.reduce((s, v) => s + Number(v.total), 0)

  const totalVentas = salesCobradas.reduce((s, v) => s + Number(v.total), 0)
  const totalNeto = salesCobradas.reduce((s, v) => s + Number(v.subtotal), 0)
  const totalIva = salesCobradas.reduce((s, v) => s + Number(v.tax), 0)
  // Lo que cubrió la obra social no entra en efectivo/tarjeta: es plata que queda
  // pendiente de cobrarle a la obra social, por fuera de este arqueo.
  const totalCobertura = sales.reduce((s, v) => s + Number(v.valor_cobertura || 0), 0)
  const totalDespachado = totalVentas + totalCobertura + totalFiado

  const porMetodo = sales.reduce((acc, v) => {
    acc[v.payment_method] = (acc[v.payment_method] || 0) + Number(v.total)
    return acc
  }, {} as Record<string, number>)

  const metodoLabel: Record<string, string> = {
    efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
    transferencia: 'Transferencia', qr: 'QR / Billetera', fiado: 'Fiado',
  }

  const totalRetiros = withdrawals.reduce((s, w) => s + Number(w.amount), 0)
  const esperadoEnCaja = (register?.opening_amount || 0) + (porMetodo['efectivo'] || 0) - totalRetiros

  if (loading) {
    return <div className="p-6 text-slate-400 animate-pulse">Cargando caja...</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* ─── ENCABEZADO PARA PANTALLA ─── */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-white">Caja</h1>
          <p className="text-sm text-slate-400">Control de apertura, cierre y arqueo</p>
        </div>
        <div className="flex items-center gap-2">
          {!blind && (
            <Button
              variant="outline"
              className="gap-2 bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
              onClick={handlePrintFiados}
              disabled={printingFiados}
            >
              <Receipt className="w-4 h-4" /> {printingFiados ? 'Imprimiendo...' : 'Imprimir fiados del día'}
            </Button>
          )}
          {register && !blind && (
            <Button
              variant="outline"
              className="gap-2 bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" /> Exportar PDF
            </Button>
          )}
          {!register ? (
            <Button onClick={() => { setActionError(''); setOpenDialog(true) }} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <LockOpen className="w-4 h-4" /> Abrir caja
            </Button>
          ) : (
            <>
              <Button onClick={() => { setRetiroError(''); setRetiroDialog(true) }} variant="outline" className="gap-2 bg-slate-800 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
                <Banknote className="w-4 h-4" /> Retiro de caja
              </Button>
              <Button onClick={() => { setActionError(''); setCloseDialog(true) }} variant="outline" className="gap-2 bg-slate-800 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300">
                <Lock className="w-4 h-4" /> Cerrar caja
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── ENCABEZADO SÓLO PARA IMPRESIÓN ─── */}
      <div className="print-only" style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Arqueo de Caja</h1>
        <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>
          {register
            ? `Apertura: ${new Date(register.opened_at).toLocaleString('es-AR')} · Monto inicial: ${fmt(register.opening_amount)}`
            : 'Caja cerrada'}
        </p>
        <p style={{ fontSize: '12px', color: '#555' }}>
          Impreso: {new Date().toLocaleString('es-AR')}
        </p>
        <hr style={{ margin: '10px 0' }} />
      </div>

      {!register ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Lock className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            {closedMsg && (
              <p className="flex items-center justify-center gap-2 text-emerald-500 font-medium mb-3">
                <CheckCircle className="w-4 h-4" /> {closedMsg}
              </p>
            )}
            <p className="text-slate-500 font-medium">La caja está cerrada</p>
            <p className="text-slate-400 text-sm">Abrí la caja para empezar a vender</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3 no-print">
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-sm px-3 py-1">
              Caja abierta
            </Badge>
            <span className="text-sm text-slate-500">
              Desde {new Date(register.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              {' '}· Monto inicial: {fmt(register.opening_amount)}
              {openedByName && <> · Abrió: {openedByName}</>}
            </span>
          </div>

          {blind ? (
            <Card>
              <CardContent className="py-10 text-center">
                <LockOpen className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
                <p className="text-slate-600 font-medium">Caja abierta — ya podés vender</p>
                <p className="text-slate-400 text-sm">Al final del turno contá el efectivo y apretá “Cerrar caja”.</p>
              </CardContent>
            </Card>
          ) : (
          <>
          {/* Resumen numérico */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ventas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{sales.length}</p>
                <p className="text-xs text-slate-400">transacciones</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Total bruto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">{fmt(totalVentas)}</p>
                <p className="text-xs text-slate-400">con IVA</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Neto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">{fmt(totalNeto)}</p>
                <p className="text-xs text-slate-400">sin IVA</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">IVA</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-slate-700">{fmt(totalIva)}</p>
                <p className="text-xs text-slate-400">Ingresos Brutos</p>
              </CardContent>
            </Card>
          </div>

          {/* Por método de pago */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Por método de pago</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(porMetodo).map(([method, amount]) => (
                  <div key={method} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">{metodoLabel[method] || method}</p>
                    <p className="font-bold text-slate-800">{fmt(amount)}</p>
                  </div>
                ))}
                {Object.keys(porMetodo).length === 0 && (
                  <p className="text-slate-400 text-sm col-span-5">Sin ventas todavía</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Arqueo (visible siempre, útil en impresión) */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Arqueo</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Monto inicial</span>
                  <span className="font-medium">{fmt(register.opening_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Efectivo en ventas</span>
                  <span className="font-medium">{fmt(porMetodo['efectivo'] || 0)}</span>
                </div>
                {totalRetiros > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Retiros de caja</span>
                    <span>− {fmt(totalRetiros)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>Esperado en caja</span>
                  <span className="text-emerald-600">{fmt(esperadoEnCaja)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cuánto es plata real y cuánto es a cobrar después (obra social o fiado) */}
          {(totalCobertura > 0 || totalFiado > 0) && (
            <Card className="border-amber-300">
              <CardHeader><CardTitle className="text-sm text-amber-700">Plata pendiente de cobrar del turno</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500 mb-3">
                  Ni la cobertura de obra social ni lo fiado son plata que falte en la caja: todavía no se cobraron
                  (la cobertura se reclama aparte — ver “Recetas pendientes” — y el fiado se le cobra al cliente más
                  adelante). Por eso, si contás los billetes, el total de abajo (“Cobrado real”) es lo que tiene que
                  dar, no el total bruto de ventas.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Valor de lo despachado (lista)</span>
                    <span className="font-medium">{fmt(totalDespachado)}</span>
                  </div>
                  {totalCobertura > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cubierto por obra social (a cobrar aparte)</span>
                      <span className="font-medium text-amber-600">− {fmt(totalCobertura)}</span>
                    </div>
                  )}
                  {totalFiado > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Fiado (a cobrarle al cliente después)</span>
                      <span className="font-medium text-amber-600">− {fmt(totalFiado)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <span>Cobrado real (efectivo + tarjetas + transferencias)</span>
                    <span className="text-emerald-600">{fmt(totalVentas)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detalle de retiros de caja */}
          {withdrawals.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader><CardTitle className="text-sm text-amber-700">Retiros de caja del turno</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Hora</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Motivo</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-600">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map(w => (
                      <tr key={w.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-500">
                          {new Date(w.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2">{w.motivo}</td>
                        <td className="px-4 py-2 text-right font-medium text-amber-600">− {fmt(Number(w.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50 font-bold">
                      <td className="px-4 py-2" colSpan={2}>TOTAL RETIRADO</td>
                      <td className="px-4 py-2 text-right text-amber-700">− {fmt(totalRetiros)}</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Detalle de fiados: para poder discriminarlos y después cobrarle a cada cliente */}
          {fiados.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader><CardTitle className="text-sm text-amber-700">Fiados del turno</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Factura</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Hora</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Cliente</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-600">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiados.map(s => (
                      <tr key={s.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2">#{s.invoice_number}</td>
                        <td className="px-4 py-2 text-slate-500">
                          {new Date(s.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2">{s.customers?.name || '—'}</td>
                        <td className="px-4 py-2 text-right font-medium text-amber-600">{fmt(Number(s.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50 font-bold">
                      <td className="px-4 py-2" colSpan={3}>TOTAL FIADO</td>
                      <td className="px-4 py-2 text-right text-amber-700">{fmt(totalFiado)}</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Detalle de ventas */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Detalle de ventas</CardTitle></CardHeader>
            <CardContent className="p-0">
              {sales.length === 0 ? (
                <p className="text-center py-6 text-slate-400 text-sm">Sin ventas en esta caja</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Factura</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Hora</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Pago</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s => (
                      <tr key={s.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2">#{s.invoice_number}</td>
                        <td className="px-4 py-2 text-slate-500">
                          {new Date(s.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2">{metodoLabel[s.payment_method] || s.payment_method}</td>
                        <td className="px-4 py-2 text-right font-medium text-emerald-600">{fmt(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50 font-bold">
                      <td className="px-4 py-2" colSpan={3}>TOTAL</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{fmt(totalVentasTodas)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
          </>
          )}
        </>
      )}

      {/* Dialog abrir caja */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Abrir caja</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Monto inicial en caja</Label>
            <Input type="number" placeholder="0.00" value={openAmount}
              onChange={e => setOpenAmount(e.target.value)} />
          </div>
          {actionError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={handleOpen} className="bg-emerald-600 hover:bg-emerald-700">Abrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cerrar caja */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cerrar caja</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {blind ? (
              <p className="text-sm text-slate-500">Contá todo el efectivo que hay en la caja (incluido el cambio inicial) y escribí el total.</p>
            ) : (
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Ventas del día (cobrado real):</span><span className="font-bold">{fmt(totalVentas)}</span></div>
              {totalCobertura > 0 && (
                <div className="flex justify-between text-amber-600"><span>+ Cubierto por obra social (a cobrar aparte):</span><span>{fmt(totalCobertura)}</span></div>
              )}
              {totalFiado > 0 && (
                <div className="flex justify-between text-amber-600"><span>+ Fiado (a cobrarle al cliente después):</span><span>{fmt(totalFiado)}</span></div>
              )}
              <div className="flex justify-between"><span>Monto inicial:</span><span>{fmt(register?.opening_amount || 0)}</span></div>
              {totalRetiros > 0 && (
                <div className="flex justify-between text-amber-600"><span>− Retiros de caja:</span><span>{fmt(totalRetiros)}</span></div>
              )}
              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>Esperado en caja (efectivo):</span>
                <span className="text-emerald-600">{fmt(esperadoEnCaja)}</span>
              </div>
            </div>
            )}
            <div>
              <Label>Monto físico contado</Label>
              <Input type="number" placeholder="0.00" value={closeAmount}
                onChange={e => setCloseAmount(e.target.value)} />
            </div>
          </div>
          {actionError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancelar</Button>
            <Button onClick={handleClose} disabled={closeAmount === ''} className="bg-red-600 hover:bg-red-700">Cerrar caja</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog retiro de caja */}
      <Dialog open={retiroDialog} onOpenChange={setRetiroDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Retiro de caja</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-500">
              Para sacar efectivo de la caja y pagar algo (luz, agua, un flete, etc.). Queda registrado y se descuenta del arqueo.
            </p>
            <div>
              <Label>Monto a retirar</Label>
              <Input type="number" placeholder="0.00" value={retiroMonto}
                onChange={e => setRetiroMonto(e.target.value)} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Input placeholder="Ej: Pago de luz" value={retiroMotivo}
                onChange={e => setRetiroMotivo(e.target.value)} />
            </div>
          </div>
          {retiroError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{retiroError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetiroDialog(false)}>Cancelar</Button>
            <Button onClick={handleRetiro} className="bg-amber-600 hover:bg-amber-700">Retirar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
