'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Save, CheckCircle, ImagePlus, Trash2, Building2, Receipt, Monitor, KeyRound, Mail } from 'lucide-react'
import { useBranding, uploadLogo, type AppSettings } from '@/context/BrandingContext'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_PRINTER_CONFIG,
  loadPrinterConfig,
  savePrinterConfig,
  printTicket,
  buildTicketHtml,
  type PrinterConfig,
  type TicketData,
} from '@/lib/ticket'

const SAMPLE: TicketData = {
  invoiceNumber: 'PRUEBA',
  date: new Date(),
  items: [
    { name: 'Ibuprofeno 400 mg x 10', qtyLabel: '1 caja', unitPrice: 2500, subtotal: 2500 },
    { name: 'Alcohol en gel 250 ml', qtyLabel: '2 cajas', unitPrice: 1800, subtotal: 3600 },
  ],
  neto: 5041.32,
  iva: 1058.68,
  total: 6100,
  paymentMethod: 'efectivo',
  cashier: 'Prueba',
}

const field = 'w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function LogoPicker({
  url, onFile, onRemove, busy, hint,
}: { url: string | null; onFile: (f: File) => void; onRemove: () => void; busy: boolean; hint: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24 rounded-xl border border-dashed border-slate-600 bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="Logo" className="max-w-full max-h-full object-contain" />
          : <ImagePlus className="w-7 h-7 text-slate-600" />}
      </div>
      <div className="space-y-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm px-3 py-2 rounded-xl disabled:opacity-50"
          >
            <ImagePlus className="w-4 h-4" /> {busy ? 'Subiendo...' : url ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
          {url && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-2 text-slate-400 hover:text-red-400 text-sm px-3 py-2 rounded-xl hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" /> Quitar
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  const { settings, loaded, save } = useBranding()
  const [form, setForm] = useState<AppSettings>(settings)
  const [printer, setPrinter] = useState<PrinterConfig>(DEFAULT_PRINTER_CONFIG)
  const [uploading, setUploading] = useState<'menu' | 'ticket' | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Mi PIN de autorización (para confirmar anulaciones que pide un cajero desde el Punto de Venta)
  const [pinSet, setPinSet] = useState<boolean | null>(null)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinStatus, setPinStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pinSaving, setPinSaving] = useState(false)

  useEffect(() => { setPrinter(loadPrinterConfig()) }, [])
  useEffect(() => { if (loaded) setForm(settings) }, [loaded, settings])
  useEffect(() => { refreshPinSet() }, [])

  async function refreshPinSet() {
    const { data } = await supabase.rpc('my_pin_set')
    setPinSet(Boolean(data))
  }

  async function handleSavePin() {
    setPinStatus(null)
    if (!/^[0-9]{4,6}$/.test(pin1)) { setPinStatus({ ok: false, msg: 'Tiene que ser de 4 a 6 números.' }); return }
    if (pin1 !== pin2) { setPinStatus({ ok: false, msg: 'Los dos PIN no coinciden.' }); return }
    setPinSaving(true)
    const { error } = await supabase.rpc('set_my_pin', { p_pin: pin1 })
    setPinSaving(false)
    if (error) { setPinStatus({ ok: false, msg: error.message }); return }
    setPin1(''); setPin2('')
    setPinStatus({ ok: true, msg: 'PIN guardado' })
    refreshPinSet()
    setTimeout(() => setPinStatus(null), 2500)
  }

  async function handleClearPin() {
    setPinSaving(true)
    const { error } = await supabase.rpc('clear_my_pin')
    setPinSaving(false)
    if (error) { setPinStatus({ ok: false, msg: error.message }); return }
    setPinStatus({ ok: true, msg: 'PIN desactivado' })
    refreshPinSet()
    setTimeout(() => setPinStatus(null), 2500)
  }

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    setStatus(null)
  }
  const setP = <K extends keyof PrinterConfig>(k: K, v: PrinterConfig[K]) => {
    setPrinter(p => ({ ...p, [k]: v }))
    setStatus(null)
  }

  async function handleUpload(file: File, kind: 'menu' | 'ticket') {
    setUploading(kind)
    const { url, error } = await uploadLogo(file, kind)
    setUploading(null)
    if (error || !url) { setStatus({ ok: false, msg: error ?? 'No se pudo subir la imagen' }); return }
    if (kind === 'menu') set('logo_url', url)
    else { set('ticket_logo_url', url); set('ticket_show_logo', true) }
  }

  async function handleSave() {
    setSaving(true)
    savePrinterConfig(printer)
    const err = await save({
      business_name: form.business_name.trim() || 'Farmacia',
      tagline: form.tagline.trim(),
      logo_url: form.logo_url,
      show_name_with_logo: form.show_name_with_logo,
      ticket_logo_url: form.ticket_logo_url,
      ticket_show_logo: form.ticket_show_logo,
      ticket_name: form.ticket_name?.trim() || null,
      ticket_address: form.ticket_address?.trim() || null,
      ticket_cuit: form.ticket_cuit?.trim() || null,
      ticket_phone: form.ticket_phone?.trim() || null,
      ticket_footer: form.ticket_footer?.trim() || null,
      owner_email: form.owner_email?.trim() || null,
      notify_on_close: form.notify_on_close,
    })
    setSaving(false)
    setStatus(err ? { ok: false, msg: `No se pudo guardar: ${err}` } : { ok: true, msg: 'Guardado' })
    if (!err) setTimeout(() => setStatus(null), 2500)
  }

  const previewHtml = useMemo(() => buildTicketHtml(SAMPLE, { ...printer, copies: 1 }, form), [printer, form])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-emerald-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white">Configuración</h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">Nombre y logo de la empresa, ticket e impresora</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6">
          {/* ── Marca ── */}
          <section className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" /> Empresa
              </h2>
              <p className="text-xs text-slate-500 mt-1">Lo que se ve arriba a la izquierda y en la pantalla de ingreso. Se aplica en todas las computadoras.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Nombre</p>
                <input className={field} value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="Farmacia San Martín" />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Texto debajo del nombre</p>
                <input className={field} value={form.tagline} onChange={e => set('tagline', e.target.value)} placeholder="Sistema de Gestión" />
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-2">Logo</p>
              <LogoPicker
                url={form.logo_url}
                busy={uploading === 'menu'}
                onFile={f => handleUpload(f, 'menu')}
                onRemove={() => set('logo_url', null)}
                hint="PNG con fondo transparente queda mejor. Máximo 2 MB."
              />
            </div>

            {form.logo_url && (
              <label className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-white">Mostrar el nombre al lado del logo</p>
                  <p className="text-xs text-slate-500">Apagalo si tu logo ya incluye el nombre.</p>
                </div>
                <Toggle checked={form.show_name_with_logo} onChange={v => set('show_name_with_logo', v)} />
              </label>
            )}

            {/* Vista previa del menú */}
            <div>
              <p className="text-xs text-slate-400 mb-2">Así se ve en el menú</p>
              <div className="w-64 bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-3 min-w-0">
                  {form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="" className={`object-contain shrink-0 ${form.show_name_with_logo ? 'h-10 max-w-[56px]' : 'h-12 max-w-[200px]'}`} />
                  ) : (
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0"><span className="text-lg">💊</span></div>
                  )}
                  {(!form.logo_url || form.show_name_with_logo) && (
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{form.business_name || 'Farmacia'}</p>
                      {form.tagline && <p className="text-slate-400 text-xs truncate">{form.tagline}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── Ticket ── */}
          <section className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" /> Ticket
              </h2>
              <p className="text-xs text-slate-500 mt-1">Datos que salen impresos. Se aplica en todas las cajas.</p>
            </div>

            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white">Imprimir logo en el ticket</p>
                <p className="text-xs text-slate-500">Sale en blanco y negro. Si no subís uno propio, usa el logo de la empresa.</p>
              </div>
              <Toggle checked={form.ticket_show_logo} onChange={v => set('ticket_show_logo', v)} />
            </label>

            {form.ticket_show_logo && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Logo para el ticket (opcional)</p>
                <LogoPicker
                  url={form.ticket_logo_url}
                  busy={uploading === 'ticket'}
                  onFile={f => handleUpload(f, 'ticket')}
                  onRemove={() => set('ticket_logo_url', null)}
                  hint="Para térmicas conviene una versión en negro sobre fondo blanco."
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-400 mb-1.5">Nombre en el ticket</p>
                <input className={field} value={form.ticket_name ?? ''} onChange={e => set('ticket_name', e.target.value)} placeholder={form.business_name || 'Igual al nombre de la empresa'} />
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-400 mb-1.5">Dirección</p>
                <input className={field} value={form.ticket_address ?? ''} onChange={e => set('ticket_address', e.target.value)} placeholder="Av. Hipólito Yrigoyen 8000, Lomas de Zamora" />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">CUIT</p>
                <input className={field} value={form.ticket_cuit ?? ''} onChange={e => set('ticket_cuit', e.target.value)} placeholder="30-12345678-9" />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Teléfono</p>
                <input className={field} value={form.ticket_phone ?? ''} onChange={e => set('ticket_phone', e.target.value)} placeholder="11 4444-5555" />
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-400 mb-1.5">Mensaje al pie</p>
                <input className={field} value={form.ticket_footer ?? ''} onChange={e => set('ticket_footer', e.target.value)} placeholder="¡Gracias por su compra!" />
              </div>
            </div>
          </section>

          {/* ── Impresora de esta computadora ── */}
          <section className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-emerald-400" /> Impresora de esta computadora
              </h2>
              <p className="text-xs text-slate-500 mt-1">Esto se guarda solo en esta computadora. Hacelo en cada caja que tenga impresora.</p>
            </div>

            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white">Imprimir ticket al cobrar</p>
                <p className="text-xs text-slate-500">Sale el ticket cada vez que se aprieta “Cobrar”.</p>
              </div>
              <Toggle checked={printer.autoPrint} onChange={v => setP('autoPrint', v)} />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-white mb-2">Ancho del papel</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['58', '80'] as const).map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setP('width', w)}
                      className={`py-2.5 rounded-xl border text-sm font-medium ${
                        printer.width === w
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {w} mm
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">Las más comunes son de 80 mm.</p>
              </div>
              <div>
                <p className="text-sm text-white mb-2">Copias por venta</p>
                <select value={printer.copies} onChange={e => setP('copies', Number(e.target.value))} className={field}>
                  <option value={1}>1 copia</option>
                  <option value={2}>2 copias</option>
                  <option value={3}>3 copias</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Avisos ── */}
          <section className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400" /> Avisos
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Cada vez que se cierra una caja (la cierre quien la cierre), te llega un resumen por mail:
                total vendido, si hubo faltante o sobrante, y si hubo ventas anuladas.
              </p>
            </div>

            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white">Mandarme el resumen al cerrar caja</p>
                <p className="text-xs text-slate-500">Si lo apagás, no se envía ningún mail.</p>
              </div>
              <Toggle checked={form.notify_on_close} onChange={v => set('notify_on_close', v)} />
            </label>

            {form.notify_on_close && (
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Tu mail</p>
                <input
                  type="email" className={field} value={form.owner_email ?? ''}
                  onChange={e => set('owner_email', e.target.value)}
                  placeholder="tu@mail.com"
                />
              </div>
            )}
          </section>

          {/* ── Mi PIN de autorización ── */}
          <section className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" /> Mi PIN de autorización
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Si un cajero necesita anular una venta recién cobrada, lo pide desde el Punto de Venta y
                te va a pedir este PIN para confirmarlo ahí mismo, sin que vos tengas que entrar al sistema.
                Es personal: no lo compartas con los cajeros.
              </p>
            </div>

            {pinSet && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Ya tenés un PIN activo.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-1.5">{pinSet ? 'Nuevo PIN (4 a 6 números)' : 'PIN (4 a 6 números)'}</p>
                <input
                  type="password" inputMode="numeric" maxLength={6}
                  className={field} value={pin1}
                  onChange={e => setPin1(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Repetir PIN</p>
                <input
                  type="password" inputMode="numeric" maxLength={6}
                  className={field} value={pin2}
                  onChange={e => setPin2(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSavePin}
                disabled={pinSaving || !pin1}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {pinSaving ? 'Guardando...' : pinSet ? 'Cambiar PIN' : 'Activar PIN'}
              </button>
              {pinSet && (
                <button
                  onClick={handleClearPin}
                  disabled={pinSaving}
                  className="text-slate-400 hover:text-red-400 text-sm px-2 py-2 disabled:opacity-50"
                >
                  Desactivar
                </button>
              )}
              {pinStatus && (
                <span className={`text-sm ${pinStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>{pinStatus.msg}</span>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || uploading !== null}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50"
            >
              {status?.ok ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              onClick={() => printTicket(SAMPLE, form, { ...printer, copies: 1 })}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl"
            >
              <Printer className="w-4 h-4" /> Imprimir ticket de prueba
            </button>
            {status && (
              <span className={`text-sm ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>{status.msg}</span>
            )}
          </div>
        </div>

        {/* Vista previa del ticket */}
        <aside className="lg:sticky lg:top-6">
          <p className="text-xs text-slate-400 mb-2">Vista previa del ticket ({printer.width} mm)</p>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex justify-center">
            <iframe
              title="Vista previa del ticket"
              srcDoc={previewHtml}
              className="bg-white rounded shadow-lg"
              style={{ width: printer.width === '58' ? 220 : 302, height: 560, border: 0 }}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
