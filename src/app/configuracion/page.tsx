'use client'
import { useEffect, useState } from 'react'
import { Printer, Save, CheckCircle } from 'lucide-react'
import {
  DEFAULT_TICKET_CONFIG,
  loadTicketConfig,
  saveTicketConfig,
  printTicket,
  type TicketConfig,
} from '@/lib/ticket'

export default function ConfiguracionPage() {
  const [cfg, setCfg] = useState<TicketConfig>(DEFAULT_TICKET_CONFIG)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setCfg(loadTicketConfig()) }, [])

  const set = <K extends keyof TicketConfig>(k: K, v: TicketConfig[K]) => {
    setCfg(c => ({ ...c, [k]: v }))
    setSaved(false)
  }

  const handleSave = () => {
    saveTicketConfig(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleTest = () => {
    printTicket({
      invoiceNumber: 'PRUEBA',
      date: new Date(),
      items: [
        { name: 'Ibuprofeno 400 mg x 10', qtyLabel: '1 caja', unitPrice: 2500, subtotal: 2500 },
        { name: 'Alcohol en gel 250 ml', qtyLabel: '2', unitPrice: 1800, subtotal: 3600 },
      ],
      neto: 5041.32,
      iva: 1058.68,
      total: 6100,
      paymentMethod: 'efectivo',
      cashier: 'Prueba',
    }, cfg)
  }

  const field = 'w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-emerald-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white">Impresora de tickets</h1>
        </div>
        <p className="text-slate-400 ml-5 text-sm">
          Esta configuración se guarda en <b>esta computadora</b>. Hacelo en cada caja que tenga impresora.
        </p>
      </div>

      <div className="space-y-6">
        {/* Impresión */}
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Printer className="w-4 h-4 text-emerald-400" /> Impresión
          </h2>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm text-white">Imprimir ticket al cobrar</p>
              <p className="text-xs text-slate-500">Sale el ticket automáticamente cada vez que se aprieta “Cobrar”.</p>
            </div>
            <input
              type="checkbox"
              checked={cfg.autoPrint}
              onChange={e => set('autoPrint', e.target.checked)}
              className="w-5 h-5 accent-emerald-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-white mb-2">Ancho del papel</p>
              <div className="grid grid-cols-2 gap-2">
                {(['58', '80'] as const).map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => set('width', w)}
                    className={`py-2.5 rounded-xl border text-sm font-medium ${
                      cfg.width === w
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
              <select
                value={cfg.copies}
                onChange={e => set('copies', Number(e.target.value))}
                className={field}
              >
                <option value={1}>1 copia</option>
                <option value={2}>2 copias</option>
                <option value={3}>3 copias</option>
              </select>
            </div>
          </div>
        </section>

        {/* Datos del local */}
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Datos que salen en el ticket</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-400 mb-1.5">Nombre del local</p>
              <input className={field} value={cfg.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Farmacia San Martín" />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-400 mb-1.5">Dirección</p>
              <input className={field} value={cfg.address} onChange={e => set('address', e.target.value)} placeholder="Av. Siempreviva 742, Lomas de Zamora" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">CUIT</p>
              <input className={field} value={cfg.cuit} onChange={e => set('cuit', e.target.value)} placeholder="30-12345678-9" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Teléfono</p>
              <input className={field} value={cfg.phone} onChange={e => set('phone', e.target.value)} placeholder="11 4444-5555" />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-400 mb-1.5">Mensaje al pie</p>
              <input className={field} value={cfg.footer} onChange={e => set('footer', e.target.value)} placeholder="¡Gracias por su compra!" />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Guardado' : 'Guardar'}
          </button>
          <button
            onClick={handleTest}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl"
          >
            <Printer className="w-4 h-4" /> Imprimir ticket de prueba
          </button>
        </div>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-sm text-slate-400 space-y-2">
          <p className="text-white font-medium">Para que imprima sin preguntar</p>
          <p>
            Normalmente el navegador muestra una ventanita para elegir la impresora. En la primera venta elegí la
            térmica y desmarcá “Encabezados y pies de página”. El navegador la recuerda para las siguientes.
          </p>
          <p>
            Si querés que salga directo sin ninguna ventanita, hay que activar el “modo kiosco de impresión” en
            el acceso directo de la app (te guío paso a paso).
          </p>
        </section>
      </div>
    </div>
  )
}
