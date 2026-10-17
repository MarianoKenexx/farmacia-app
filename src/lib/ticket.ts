// Impresión de tickets en impresoras térmicas (58 mm u 80 mm).
//
// La impresora se instala en la computadora como cualquier otra impresora
// (con el driver del fabricante) y la app le manda el ticket a través del
// navegador. La configuración se guarda en cada computadora, porque cada
// caja puede tener su propia impresora y su propio local.

export interface TicketConfig {
  autoPrint: boolean      // imprimir solo al apretar "Cobrar"
  width: '58' | '80'      // ancho del papel en mm
  businessName: string
  address: string
  cuit: string
  phone: string
  footer: string
  copies: number
}

export const DEFAULT_TICKET_CONFIG: TicketConfig = {
  autoPrint: true,
  width: '80',
  businessName: 'Farmacia',
  address: '',
  cuit: '',
  phone: '',
  footer: '¡Gracias por su compra!',
  copies: 1,
}

const STORAGE_KEY = 'farmacia.ticketConfig'

export function loadTicketConfig(): TicketConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TICKET_CONFIG }
    return { ...DEFAULT_TICKET_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_TICKET_CONFIG }
  }
}

export function saveTicketConfig(cfg: TicketConfig) {
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
}

export const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  qr: 'QR / Billetera virtual',
}

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildTicketHtml(data: TicketData, cfg: TicketConfig) {
  const w = cfg.width === '58' ? 58 : 80
  const fontSize = w === 58 ? 10 : 12
  const line = '<div class="sep"></div>'

  const header = [
    `<div class="center big">${esc(cfg.businessName || 'Farmacia')}</div>`,
    cfg.address && `<div class="center">${esc(cfg.address)}</div>`,
    cfg.phone && `<div class="center">Tel: ${esc(cfg.phone)}</div>`,
    cfg.cuit && `<div class="center">CUIT: ${esc(cfg.cuit)}</div>`,
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
      ${line}
      ${cfg.footer ? `<div class="center">${esc(cfg.footer)}</div>` : ''}
      <div class="center small">Comprobante no válido como factura</div>
    </div>`

  const copies = Math.max(1, Math.min(3, cfg.copies || 1))

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title>
  <style>
    @page { size: ${w}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: ${w}mm; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: ${fontSize}px; line-height: 1.3; }
    .ticket { padding: 3mm ${w === 58 ? 2 : 4}mm 6mm; page-break-after: always; }
    .ticket:last-child { page-break-after: auto; }
    .center { text-align: center; }
    .big { font-size: ${fontSize + 4}px; font-weight: 700; }
    .bold { font-weight: 700; }
    .small { font-size: ${fontSize - 2}px; margin-top: 2mm; }
    .row { display: flex; justify-content: space-between; gap: 2mm; }
    .item { font-weight: 600; margin-top: 1mm; }
    .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  </style></head><body>${Array(copies).fill(one).join('')}</body></html>`
}

// Imprime usando un marco oculto, sin abrir otra ventana.
export function printTicket(data: TicketData, cfg: TicketConfig = loadTicketConfig()) {
  if (typeof window === 'undefined') return
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) { iframe.remove(); return }
  doc.open()
  doc.write(buildTicketHtml(data, cfg))
  doc.close()

  const win = iframe.contentWindow
  const cleanup = () => setTimeout(() => iframe.remove(), 1000)
  setTimeout(() => {
    try {
      win?.focus()
      win?.print()
    } finally {
      cleanup()
    }
  }, 150)
}
