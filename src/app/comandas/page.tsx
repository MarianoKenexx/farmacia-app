'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useBranding } from '@/context/BrandingContext'
import { inicioPeriodo, PERIODO_LABEL, type Periodo } from '@/lib/roles'
import { loadPrinterConfig, printTicket, printComandaTicket, METODO_LABEL, type TicketData, type ComandaTicketData } from '@/lib/ticket'
import { Receipt, Search, Printer, Ban, X, ChevronDown, ChevronRight, Clock } from 'lucide-react'

interface ComandaRow {
  id: string
  invoice_number: number
  created_at: string
  status: string
  payment_method: string | null
  total: number
  tax: number
  subtotal: number
  valor_cobertura: number | null
  customer_id: string | null
  obra_social_id: string | null
  void_reason: string | null
  user_id: string | null
  customers: { name: string } | null
  obras_sociales: { nombre: string } | null
}

interface LineRow {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  subtotal: number
  con_cobertura: boolean
  is_fraccion: boolean
  products: { name: string; unidades_por_envase: number | null; nombre_fraccion: string | null } | null
}

const PERIODOS: Periodo[] = ['hoy', 'semana', 'mes', 'todo']
const ESTADOS = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendiente_cobro', label: 'Pendientes de cobro' },
  { value: 'completed', label: 'Cobradas' },
  { value: 'voided', label: 'Anuladas' },
]
const ESTADO_BADGE: Record<string, string> = {
  pendiente_cobro: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  voided: 'bg-red-500/15 text-red-400 border-red-500/30',
}
const ESTADO_LABEL: Record<string, string> = {
  pendiente_cobro: 'Pendiente de cobro',
  completed: 'Cobrada',
  voided: 'Anulada',
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

function qtyLabel(l: LineRow) {
  const upe = l.products?.unidades_por_envase || 1
  if (l.is_fraccion) {
    const n = Math.round(l.quantity * upe)
    return `${n} ${l.products?.nombre_fraccion || 'unidad'}${n !== 1 ? 's' : ''}`
  }
  return `${parseFloat(l.quantity.toFixed(4))} caja${l.quantity !== 1 ? 's' : ''}`
}

export default function ComandasPage() {
  const { settings: brand } = useBranding()
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [estado, setEstado] = useState('todas')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ComandaRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [linesCache, setLinesCache] = useState<Record<string, LineRow[]>>({})

  const [voidTarget, setVoidTarget] = useState<ComandaRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidPin, setVoidPin] = useState('')
  const [voidError, setVoidError] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const desde = inicioPeriodo(periodo)
    let q = supabase
      .from('sales')
      .select('id, invoice_number, created_at, status, payment_method, total, tax, subtotal, valor_cobertura, customer_id, obra_social_id, void_reason, user_id, customers(name), obras_sociales(nombre)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (desde) q = q.gte('created_at', desde.toISOString())
    if (estado !== 'todas') q = q.eq('status', estado)
    const { data } = await q
    setRows(((data ?? []) as unknown) as ComandaRow[])

    const { data: profs } = await supabase.from('profiles').select('id, name')
    const map: Record<string, string> = {}
    for (const p of profs ?? []) map[p.id] = p.name
    setNames(map)
    setLoading(false)
  }, [periodo, estado])

  useEffect(() => { load() }, [load])

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!linesCache[id]) {
      const { data } = await supabase
        .from('sale_items')
        .select('id, product_id, quantity, unit_price, subtotal, con_cobertura, is_fraccion, products(name, unidades_por_envase, nombre_fraccion)')
        .eq('sale_id', id)
      setLinesCache(prev => ({ ...prev, [id]: ((data ?? []) as unknown) as LineRow[] }))
    }
  }

  function reimprimir(row: ComandaRow) {
    const lines = linesCache[row.id] || []
    const printer = loadPrinterConfig()
    if (row.status === 'pendiente_cobro') {
      const ticket: ComandaTicketData = {
        invoiceNumber: row.invoice_number,
        date: new Date(row.created_at),
        items: lines.map(l => ({ name: l.products?.name || '', qtyLabel: qtyLabel(l), unitPrice: l.unit_price, subtotal: l.subtotal })),
        neto: row.total - row.tax,
        iva: row.tax,
        total: row.total,
        dispatcher: row.user_id ? names[row.user_id] : undefined,
        customerName: row.customers?.name,
        obraSocialNombre: row.obras_sociales?.nombre,
        valorCobertura: row.valor_cobertura || 0,
        reprint: true,
      }
      printComandaTicket(ticket, brand, printer)
    } else {
      const ticket: TicketData = {
        invoiceNumber: row.invoice_number,
        date: new Date(row.created_at),
        items: lines.map(l => ({ name: l.products?.name || '', qtyLabel: qtyLabel(l), unitPrice: l.unit_price, subtotal: l.subtotal })),
        neto: row.total - row.tax,
        iva: row.tax,
        total: row.total,
        paymentMethod: row.payment_method || 'efectivo',
        cashier: row.user_id ? names[row.user_id] : undefined,
        obraSocialNombre: row.obras_sociales?.nombre,
        valorCobertura: row.valor_cobertura || 0,
        reprint: true,
      }
      printTicket(ticket, brand, printer)
    }
  }

  async function handleVoid() {
    if (!voidTarget) return
    setVoidError('')
    if (!voidReason.trim()) { setVoidError('Indicá el motivo.'); return }
    if (!/^[0-9]{4,6}$/.test(voidPin)) { setVoidError('El PIN del supervisor es de 4 a 6 números.'); return }
    setVoiding(true)
    const { error } = await supabase.rpc('anular_comanda_with_pin', {
      p_sale_id: voidTarget.id, p_reason: voidReason.trim(), p_pin: voidPin,
    })
    setVoiding(false)
    if (error) { setVoidError(error.message); return }
    setVoidTarget(null)
    setVoidReason('')
    setVoidPin('')
    setMsg('Comanda anulada. El stock se devolvió solo.')
    setTimeout(() => setMsg(''), 4000)
    load()
  }

  const filtered = rows.filter(r => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return String(r.invoice_number).includes(q) || (r.customers?.name || '').toLowerCase().includes(q)
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Receipt className="w-5 h-5 text-slate-400" /> Comandas</h1>
        {msg && <span className="text-sm text-emerald-400">{msg}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1">
          {PERIODOS.map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${periodo === p ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {PERIODO_LABEL[p]}
            </button>
          ))}
        </div>
        <select
          value={estado}
          onChange={e => setEstado(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
        >
          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por N° o cliente..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center">
          <Receipt className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No hay comandas en este período/filtro.</p>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          {filtered.map(row => (
            <div key={row.id} className="border-b border-slate-700 last:border-0">
              <button onClick={() => toggleExpand(row.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/40 text-left">
                {expanded === row.id ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                <span className="text-sm font-bold text-white w-16 flex-shrink-0">#{row.invoice_number}</span>
                <span className="text-xs text-slate-500 flex items-center gap-1 w-32 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {new Date(row.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-lg border flex-shrink-0 ${ESTADO_BADGE[row.status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                  {ESTADO_LABEL[row.status] ?? row.status}
                </span>
                <span className="text-sm text-slate-300 flex-1 truncate">{row.customers?.name || '—'}</span>
                {row.payment_method && (
                  <span className="text-xs text-slate-500 flex-shrink-0">{METODO_LABEL[row.payment_method] ?? row.payment_method}</span>
                )}
                <span className="text-sm font-bold text-emerald-400 w-24 text-right flex-shrink-0">{fmt(row.total)}</span>
              </button>

              {expanded === row.id && (
                <div className="px-4 pb-4 pl-11 space-y-2">
                  {row.void_reason && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">Motivo de anulación: {row.void_reason}</p>
                  )}
                  {row.obras_sociales?.nombre && (
                    <p className="text-xs text-amber-400">Cobertura {row.obras_sociales.nombre}: -{fmt(row.valor_cobertura || 0)}</p>
                  )}
                  <div className="bg-slate-900 rounded-xl border border-slate-700 divide-y divide-slate-800">
                    {(linesCache[row.id] || []).length === 0 ? (
                      <p className="text-xs text-slate-500 px-3 py-2">Cargando ítems...</p>
                    ) : (
                      linesCache[row.id].map(l => (
                        <div key={l.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                          <div className="min-w-0">
                            <p className="text-white truncate">{l.products?.name}</p>
                            <p className="text-xs text-slate-500">{qtyLabel(l)} x {fmt(l.unit_price)}</p>
                          </div>
                          <p className="text-emerald-400 font-semibold flex-shrink-0 ml-2">{fmt(l.subtotal)}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => reimprimir(row)}
                      className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg"
                    >
                      <Printer className="w-3.5 h-3.5" /> Reimprimir
                    </button>
                    {row.status === 'pendiente_cobro' && (
                      <button
                        onClick={() => { setVoidTarget(row); setVoidError(''); setVoidReason(''); setVoidPin('') }}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-slate-900 hover:bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-lg"
                      >
                        <Ban className="w-3.5 h-3.5" /> Anular
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Anular: pide motivo y PIN de un supervisor */}
      {voidTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2"><Ban className="w-4 h-4 text-red-400" /> Anular comanda #{voidTarget.invoice_number}</h2>
              <button onClick={() => setVoidTarget(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">Esto devuelve el stock y queda registrado. Necesitás que un supervisor confirme con su PIN.</p>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Motivo</p>
              <textarea
                value={voidReason} onChange={e => setVoidReason(e.target.value)}
                rows={2} placeholder="Ej: se cargó mal, quedó duplicada..."
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
              <button onClick={() => setVoidTarget(null)} className="text-sm text-slate-300 hover:text-white px-3 py-2">Cancelar</button>
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
