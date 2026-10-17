'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CashRegister, Sale } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LockOpen, Lock, DollarSign, TrendingUp, Printer, CheckCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function CajaPage() {
  const [register, setRegister] = useState<CashRegister | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [openAmount, setOpenAmount] = useState('')
  const [closeAmount, setCloseAmount] = useState('')
  const [openDialog, setOpenDialog] = useState(false)
  const [closeDialog, setCloseDialog] = useState(false)
  const [loading, setLoading] = useState(true)
  const [closedMsg, setClosedMsg] = useState('')
  const [actionError, setActionError] = useState('')
  const [openedByName, setOpenedByName] = useState<string | null>(null)
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
        .select('*')
        .eq('register_id', reg.id)
        .eq('status', 'completed')
      setSales(s || [])
    }
    setLoading(false)
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
    setCloseDialog(false)
    setClosedMsg(`Caja cerrada. Monto contado registrado: ${fmt(Number(closeAmount))}`)
    setCloseAmount('')
    setRegister(null)
    setSales([])
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const totalVentas = sales.reduce((s, v) => s + Number(v.total), 0)
  const totalNeto = sales.reduce((s, v) => s + Number(v.subtotal), 0)
  const totalIva = sales.reduce((s, v) => s + Number(v.tax), 0)

  const porMetodo = sales.reduce((acc, v) => {
    acc[v.payment_method] = (acc[v.payment_method] || 0) + Number(v.total)
    return acc
  }, {} as Record<string, number>)

  const metodoLabel: Record<string, string> = {
    efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
    transferencia: 'Transferencia', qr: 'QR / Billetera',
  }

  const esperadoEnCaja = (register?.opening_amount || 0) + (porMetodo['efectivo'] || 0)

  if (loading) {
    return <div className="p-6 text-slate-400 animate-pulse">Cargando caja...</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* ─── ENCABEZADO PARA PANTALLA ─── */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Caja</h1>
          <p className="text-sm text-slate-500">Control de apertura, cierre y arqueo</p>
        </div>
        <div className="flex items-center gap-2">
          {register && !blind && (
            <Button
              variant="outline"
              className="gap-2"
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
            <Button onClick={() => { setActionError(''); setCloseDialog(true) }} variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-50">
              <Lock className="w-4 h-4" /> Cerrar caja
            </Button>
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
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>Esperado en caja</span>
                  <span className="text-emerald-600">{fmt(esperadoEnCaja)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

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
                      <td className="px-4 py-2 text-right text-emerald-700">{fmt(totalVentas)}</td>
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
              <div className="flex justify-between"><span>Ventas del día:</span><span className="font-bold">{fmt(totalVentas)}</span></div>
              <div className="flex justify-between"><span>Monto inicial:</span><span>{fmt(register?.opening_amount || 0)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>Esperado en caja:</span>
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
    </div>
  )
}
