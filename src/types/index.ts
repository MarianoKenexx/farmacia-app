export interface Category {
  id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  barcode?: string
  category_id?: string
  laboratory?: string
  purchase_price: number
  sale_price: number
  stock: number
  min_stock: number
  iva_rate: number
  image_url?: string
  unidades_por_envase?: number
  nombre_fraccion?: string
  tipo_venta: 'libre' | 'receta' | 'receta_archivada'
  active: boolean
  created_at: string
  categories?: Category
}

export interface ObraSocial {
  id: string
  nombre: string
  porcentaje_cobertura: number
  active: boolean
  created_at: string
}

export const TIPO_VENTA_LABEL: Record<Product['tipo_venta'], string> = {
  libre: 'Venta libre',
  receta: 'Bajo receta',
  receta_archivada: 'Receta archivada',
}

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  dni?: string
  created_at: string
}

export interface CashRegister {
  id: string
  opening_amount: number
  closing_amount?: number
  opened_at: string
  closed_at?: string
  status: 'open' | 'closed'
  opened_by?: string | null
  closed_by?: string | null
}

export interface Sale {
  id: string
  invoice_number: number
  customer_id?: string
  register_id?: string
  subtotal: number
  tax: number
  total: number
  payment_method: string
  status: string // 'completed' | 'voided'
  created_at: string
  user_id?: string | null
  voided_at?: string | null
  voided_by?: string | null
  void_reason?: string | null
  obra_social_id?: string | null
  valor_cobertura?: number
  estado_reclamo?: 'pendiente' | 'presentado' | 'cobrado' | null
  estado_reclamo_at?: string | null
  estado_reclamo_by?: string | null
  monto_cobrado?: number | null
  customers?: Customer
  sale_items?: SaleItem[]
  obras_sociales?: ObraSocial
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  subtotal: number
  con_cobertura?: boolean
  returned_qty?: number
  products?: Product
}

export interface PriceChangeLog {
  id: string
  product_id: string | null
  product_name: string
  old_sale_price: number | null
  new_sale_price: number | null
  old_purchase_price: number | null
  new_purchase_price: number | null
  changed_by: string | null
  changed_at: string
}

export interface Proveedor {
  id: string
  nombre: string
  cuit?: string | null
  telefono?: string | null
  contacto?: string | null
  active: boolean
  created_at: string
}

export interface Compra {
  id: string
  proveedor_id: string | null
  numero_factura: string | null
  total: number
  created_by: string | null
  created_at: string
  proveedores?: Proveedor
  compra_items?: CompraItem[]
}

export interface CompraItem {
  id: string
  compra_id: string
  product_id: string | null
  product_name: string
  quantity: number
  costo_unitario: number
  subtotal: number
}

export interface CartItem {
  product: Product
  quantity: number
  subtotal: number
}

export interface StockMovement {
  id: string
  product_id: string
  type: 'entrada' | 'salida' | 'ajuste'
  quantity: number
  reason?: string
  created_at: string
  products?: Product
}

export interface Alert {
  id: string
  type: 'faltante' | 'sobrante' | 'sin_stock' | 'stock_bajo' | 'venta_anulada' | string
  severity: 'alta' | 'media' | 'info' | string
  title: string
  body: string | null
  register_id: string | null
  product_id: string | null
  sale_id: string | null
  created_at: string
  read_at: string | null
}
