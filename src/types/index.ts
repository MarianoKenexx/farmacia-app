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
  active: boolean
  created_at: string
  categories?: Category
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
  status: string
  created_at: string
  customers?: Customer
  sale_items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  subtotal: number
  products?: Product
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
