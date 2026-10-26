// Impresión de tickets en impresoras térmicas (58 mm u 80 mm).
//
// - Lo que depende de la impresora (ancho, copias, imprimir solo) se guarda en
//   cada computadora, porque cada caja puede tener una impresora distinta.
// - Los datos de la empresa (nombre, logo, CUIT...) vienen de la configuración
//   compartida (app_settings) y son iguales en todas las cajas.
import type { AppSettings } from '@/context/BrandingContext'

export interface PrinterConfig {
  autoPrint: boolean      // imprimir solo al apretar "Cobrar"
  width: '58' | '80'      // ancho del papel en mm
  copies: number
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  autoPrint: true,
  width: '80',
  copies: 1,
}

const STORAGE_KEY = 'farmacia.ticketConfig'

export function loadPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PRINTER_CONFIG }
    const p = JSON.parse(raw)
    return {
      autoPrint: typeof p.autoPrint === 'boolean' ? p.autoPrint : DEFAULT_PRINTER_CONFIG.autoPrint,
      width: p.width === '58' ? '58' : '80',
      copies: Number(p.copies) || 1,
    }
  } catch {
    return { ...DEFAULT_PRINTER_CONFIG }
  }
}

export function savePrinterConfig(cfg: PrinterConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch {
    /* sin almacenamiento disponible: se usa la config por defecto */
  }
}

export interface TicketItem {
  name: string
  qtyLabel: string
  unitPrice: number
  subtotal: number
}

export interface TicketData {
  invoiceNumber: number | string
  date: Date
  items: TicketItem[]
  neto: number
  iva: number
  total: number
  paymentMethod: string
  cashier?: string
  reprint?: boolean
  obraSocialNombre?: string
  valorCobertura?: number
}

export const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  qr: 'QR / Billetera virtual',
  fiado: 'Fiado',
}

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Logo que va en el ticket: el propio del ticket, o si no hay, el del menú
export function ticketLogoUrl(brand: AppSettings) {
  if (!brand.ticket_show_logo) return null
  return brand.ticket_logo_url || brand.logo_url || null
}

export function buildTicketHtml(data: TicketData, printer: PrinterConfig, brand: AppSettings) {
  const w = printer.width === '58' ? 58 : 80
  const fontSize = w === 58 ? 10 : 12
  const line = '<div class="sep"></div>'
  const name = brand.ticket_name?.trim() || brand.business_name || 'Farmacia'
  const logo = ticketLogoUrl(brand)

  const header = [
    logo && `<div class="center"><img class="logo" src="${esc(logo)}" alt=""></div>`,
    `<div class="center big">${esc(name)}</div>`,
    brand.ticket_address && `<div class="center">${esc(brand.ticket_address)}</div>`,
    brand.ticket_phone && `<div class="center">Tel: ${esc(brand.ticket_phone)}</div>`,
    brand.ticket_cuit && `<div class="center">CUIT: ${esc(brand.ticket_cuit)}</div>`,
  ].filter(Boolean).join('')

  const items = data.items.map(i => `
    <div class="item">${esc(i.name)}</div>
    <div class="row"><span>${esc(i.qtyLabel)} x ${money(i.unitPrice)}</span><span>${money(i.subtotal)}</span></div>
  `).join('')

  const one = `
    <div class="ticket">
      ${header}
      ${line}
      <div class="row"><span>Ticket N° ${esc(String(data.invoiceNumber))}</span></div>
      <div class="row"><span>${data.date.toLocaleDateString('es-AR')}</span><span>${data.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span></div>
      ${data.cashier ? `<div class="row"><span>Atendió: ${esc(data.cashier)}</span></div>` : ''}
      ${data.reprint ? '<div class="center bold">*** REIMPRESIÓN ***</div>' : ''}
      ${line}
      ${items}
      ${line}
      <div class="row"><span>Neto</span><span>${money(data.neto)}</span></div>
      <div class="row"><span>IVA</span><span>${money(data.iva)}</span></div>
      <div class="row big"><span>TOTAL</span><span>${money(data.total)}</span></div>
      <div class="row"><span>Pago</span><span>${esc(METODO_LABEL[data.paymentMethod] ?? data.paymentMethod)}</span></div>
      ${data.obraSocialNombre ? `<div class="row small"><span>Cobertura ${esc(data.obraSocialNombre)}</span><span>-${money(data.valorCobertura ?? 0)}</span></div>` : ''}
      ${line}
      ${brand.ticket_footer ? `<div class="center">${esc(brand.ticket_footer)}</div>` : ''}
      <div class="center small">Comprobante no válido como factura</div>
    </div>`

  const copies = Math.max(1, Math.min(3, printer.copies || 1))

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title>
  <style>
    @page { size: ${w}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: ${w}mm; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: ${fontSize}px; line-height: 1.3; }
    .ticket { padding: 3mm ${w === 58 ? 2 : 4}mm 6mm; page-break-after: always; }
    .ticket:last-child { page-break-after: auto; }
    .center { text-align: center; }
    .logo { display: block; margin: 0 auto 2mm; max-width: 70%; max-height: 22mm; object-fit: contain; filter: grayscale(1) contrast(1.2); }
    .big { font-size: ${fontSize + 4}px; font-weight: 700; }
    .bold { font-weight: 700; }
    .small { font-size: ${fontSize - 2}px; margin-top: 2mm; }
    .row { display: flex; justify-content: space-between; gap: 2mm; }
    .item { font-weight: 600; margin-top: 1mm; }
    .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  </style></head><body>${Array(copies).fill(one).join('')}</body></html>`
}

export interface ComandaTicketData {
  invoiceNumber: number | string
  date: Date
  items: TicketItem[]
  neto: number
  iva: number
  total: number
  dispatcher?: string
  obraSocialNombre?: string
  valorCobertura?: number
  customerName?: string
  reprint?: boolean
}

// Comandera: lo que el farmacéutico le entrega al cliente para que lo
// lleve a caja. No tiene método de pago (todavía no se cobró) y
// resalta bien grande el total a abonar, para que sea obvio en el
// mostrador de caja cuánto hay que cobrar.
export function buildComandaTicketHtml(data: ComandaTicketData, printer: PrinterConfig, brand: AppSettings) {
  const w = printer.width === '58' ? 58 : 80
  const fontSize = w === 58 ? 10 : 12
  const line = '<div class="sep"></div>'
  const name = brand.ticket_name?.trim() || brand.business_name || 'Farmacia'
  const logo = ticketLogoUrl(brand)

  const header = [
    logo && `<div class="center"><img class="logo" src="${esc(logo)}" alt=""></div>`,
    `<div class="center big">${esc(name)}</div>`,
  ].filter(Boolean).join('')

  const items = data.items.map(i => `
    <div class="item">${esc(i.name)}</div>
    <div class="row"><span>${esc(i.qtyLabel)} x ${money(i.unitPrice)}</span><span>${money(i.subtotal)}</span></div>
  `).join('')

  const one = `
    <div class="ticket">
      ${header}
      ${line}
      <div class="center big">COMANDA N° ${esc(String(data.invoiceNumber))}</div>
      <div class="row"><span>${data.date.toLocaleDateString('es-AR')}</span><span>${data.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span></div>
      ${data.dispatcher ? `<div class="row"><span>Despachó: ${esc(data.dispatcher)}</span></div>` : ''}
      ${data.customerName ? `<div class="row"><span>Cliente: ${esc(data.customerName)}</span></div>` : ''}
      ${data.reprint ? '<div class="center bold">*** REIMPRESIÓN ***</div>' : ''}
      ${line}
      ${items}
      ${line}
      <div class="row"><span>Neto</span><span>${money(data.neto)}</span></div>
      <div class="row"><span>IVA</span><span>${money(data.iva)}</span></div>
      ${data.obraSocialNombre ? `<div class="row small"><span>Cobertura ${esc(data.obraSocialNombre)}</span><span>-${money(data.valorCobertura ?? 0)}</span></div>` : ''}
      ${line}
      <div class="center" style="font-size:${fontSize - 1}px">A COBRAR EN CAJA</div>
      <div class="row big"><span>TOTAL</span><span>${money(data.total)}</span></div>
      ${line}
      <div class="center bold">PRESENTAR ESTE TICKET EN CAJA</div>
      <div class="center small">Comprobante interno — no válido como factura</div>
    </div>`

  const copies = Math.max(1, Math.min(3, printer.copies || 1))

  return `<!doctype html><html><head><meta charset="utf-8"><title>Comanda</title>
  <style>
    @page { size: ${w}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: ${w}mm; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: ${fontSize}px; line-height: 1.3; }
    .ticket { padding: 3mm ${w === 58 ? 2 : 4}mm 6mm; page-break-after: always; }
    .ticket:last-child { page-break-after: auto; }
    .center { text-align: center; }
    .logo { display: block; margin: 0 auto 2mm; max-width: 70%; max-height: 22mm; object-fit: contain; filter: grayscale(1) contrast(1.2); }
    .big { font-size: ${fontSize + 4}px; font-weight: 700; }
    .bold { font-weight: 700; }
    .small { font-size: ${fontSize - 2}px; margin-top: 2mm; }
    .row { display: flex; justify-content: space-between; gap: 2mm; }
    .item { font-weight: 600; margin-top: 1mm; }
    .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  </style></head><body>${Array(copies).fill(one).join('')}</body></html>`
}

export function printComandaTicket(data: ComandaTicketData, brand: AppSettings, printer: PrinterConfig = loadPrinterConfig()) {
  if (typeof window === 'undefined') return
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) { iframe.remove(); return }
  doc.open()
  doc.write(buildComandaTicketHtml(data, printer, brand))
  doc.close()

  const win = iframe.contentWindow
  const imgs = Array.from(doc.images)
  const ready = Promise.race([
    Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() }))),
    new Promise<void>(r => setTimeout(r, 3000)),
  ])

  ready.then(() => {
    setTimeout(() => {
      try {
        win?.focus()
        win?.print()
      } finally {
        setTimeout(() => iframe.remove(), 1000)
      }
    }, 100)
  })
}

export interface FiadoTicketRow {
  invoiceNumber: number | string
  date: Date
  cliente: string
  monto: number
}

// Ticket-resumen de todos los fiados del día, para que al cerrar quede un
// papel con la lista de a quién se le fió y cuánto (y poder reclamarlo).
export function buildFiadosTicketHtml(rows: FiadoTicketRow[], fecha: Date, brand: AppSettings, printer: PrinterConfig) {
  const w = printer.width === '58' ? 58 : 80
  const fontSize = w === 58 ? 10 : 12
  const line = '<div class="sep"></div>'
  const name = brand.ticket_name?.trim() || brand.business_name || 'Farmacia'
  const logo = ticketLogoUrl(brand)
  const total = rows.reduce((s, r) => s + r.monto, 0)

  const header = [
    logo && `<div class="center"><img class="logo" src="${esc(logo)}" alt=""></div>`,
    `<div class="center big">${esc(name)}</div>`,
    brand.ticket_address && `<div class="center">${esc(brand.ticket_address)}</div>`,
  ].filter(Boolean).join('')

  const items = rows.length === 0
    ? '<div class="center small">Sin fiados en el día</div>'
    : rows.map(r => `
      <div class="item">${esc(r.cliente)} <span style="font-weight:400">· #${esc(String(r.invoiceNumber))}</span></div>
      <div class="row"><span>${r.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span><span>${money(r.monto)}</span></div>
    `).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Fiados del día</title>
  <style>
    @page { size: ${w}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: ${w}mm; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: ${fontSize}px; line-height: 1.3; }
    .ticket { padding: 3mm ${w === 58 ? 2 : 4}mm 6mm; }
    .center { text-align: center; }
    .logo { display: block; margin: 0 auto 2mm; max-width: 70%; max-height: 22mm; object-fit: contain; filter: grayscale(1) contrast(1.2); }
    .big { font-size: ${fontSize + 4}px; font-weight: 700; }
    .bold { font-weight: 700; }
    .small { font-size: ${fontSize - 2}px; margin-top: 2mm; }
    .row { display: flex; justify-content: space-between; gap: 2mm; }
    .item { font-weight: 600; margin-top: 1mm; }
    .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  </style></head><body>
    <div class="ticket">
      ${header}
      ${line}
      <div class="center big">FIADOS DEL DÍA</div>
      <div class="row"><span>${fecha.toLocaleDateString('es-AR')}</span><span>${rows.length} fiado${rows.length === 1 ? '' : 's'}</span></div>
      ${line}
      ${items}
      ${line}
      <div class="row big"><span>TOTAL</span><span>${money(total)}</span></div>
      ${line}
      <div class="center small">Comprobante interno — no válido como factura</div>
    </div>
  </body></html>`
}

export function printFiadosTicket(rows: FiadoTicketRow[], fecha: Date, brand: AppSettings, printer: PrinterConfig = loadPrinterConfig()) {
  if (typeof window === 'undefined') return
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) { iframe.remove(); return }
  doc.open()
  doc.write(buildFiadosTicketHtml(rows, fecha, brand, printer))
  doc.close()

  const win = iframe.contentWindow
  const imgs = Array.from(doc.images)
  const ready = Promise.race([
    Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() }))),
    new Promise<void>(r => setTimeout(r, 3000)),
  ])

  ready.then(() => {
    setTimeout(() => {
      try {
        win?.focus()
        win?.print()
      } finally {
        setTimeout(() => iframe.remove(), 1000)
      }
    }, 100)
  })
}

// Imprime usando un marco oculto, sin abrir otra ventana.
// Espera a que cargue el logo (máximo 3 segundos) para que salga en el papel.
export function printTicket(data: TicketData, brand: AppSettings, printer: PrinterConfig = loadPrinterConfig()) {
  if (typeof window === 'undefined') return
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) { iframe.remove(); return }
  doc.open()
  doc.write(buildTicketHtml(data, printer, brand))
  doc.close()

  const win = iframe.contentWindow
  const imgs = Array.from(doc.images)
  const ready = Promise.race([
    Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() }))),
    new Promise<void>(r => setTimeout(r, 3000)),
  ])

  ready.then(() => {
    setTimeout(() => {
      try {
        win?.focus()
        win?.print()
      } finally {
        setTimeout(() => iframe.remove(), 1000)
      }
    }, 100)
  })
}
