'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  DollarSign,
  ReceiptText,
} from 'lucide-react'
import { METODO_LABEL } from '@/lib/ticket'
import { useAlerts } from '@/context/AlertsContext'
import Link from 'next/link'
import { Bell } from 'lucide-react'

interface DashboardStats {
  ventasHoy: number
  totalHoy: number
  netoHoy: number
  productosActivos: number
  stockBajo: number
  cajaAbierta: boolean
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    ventasHoy: 0,
    totalHoy: 0,
    netoHoy: 0,
    productosActivos: 0,
    stockBajo: 0,
    cajaAbierta: false,
  })
  const [ventasRecientes, setVentasRecientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { unread } = useAlerts()

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [salesRes, productsRes, registerRes, lowStockRes, recentRes] = await Promise.all([
      supabase
        .from('sales')
        .select('total, subtotal')
        .gte('created_at', today.toISOString())
        .eq('status', 'completed'),
      supabase.from('products').select('id', { count: 'exact' }).eq('active', true),
      supabase.from('cash_registers').select('*').eq('status', 'open').limit(1),
      supabase.from('products').select('stock, min_stock').eq('active', true),
      supabase
        .from('sales')
        .select('*, customers(name)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const ventas = salesRes.data || []
    const totalHoy = ventas.reduce((s, v) => s + Number(v.total), 0)
    const netoHoy = ventas.reduce((s, v) => s + Number(v.subtotal), 0)

    setStats({
      ventasHoy: ventas.length,
      totalHoy,
      netoHoy,
      productosActivos: productsRes.count || 0,
      stockBajo: (lowStockRes.data || []).filter(p => Number(p.stock) <= Number(p.min_stock)).length,
      cajaAbierta: (registerRes.data?.length || 0) > 0,
    })
    setVentasRecientes(recentRes.data || [])
    setLoading(false)
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <p className="text-slate-500 animate-pulse">Cargando dashboard...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm">
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {unread > 0 && (
        <Link href="/alertas" className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm hover:bg-red-500/15">
          <Bell className="w-4 h-4" />
          Tenés {unread} alerta{unread !== 1 ? 's' : ''} sin ver
          <span className="ml-auto font-semibold underline underline-offset-2">Ver</span>
        </Link>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Ventas hoy</CardTitle>
            <ShoppingCart className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.ventasHoy}</p>
            <p className="text-xs text-slate-500">transacciones</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total del día</CardTitle>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{fmt(stats.totalHoy)}</p>
            <p className="text-xs text-slate-500">bruto con IVA</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Neto del día</CardTitle>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{fmt(stats.netoHoy)}</p>
            <p className="text-xs text-slate-500">sin IVA</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Productos activos</CardTitle>
            <Package className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.productosActivos}</p>
            <p className="text-xs text-slate-500">en catálogo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Stock bajo</CardTitle>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.stockBajo}</p>
            <p className="text-xs text-slate-500">productos por reponer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Caja</CardTitle>
            <ReceiptText className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <Badge variant={stats.cajaAbierta ? 'default' : 'secondary'}
              className={stats.cajaAbierta ? 'bg-emerald-500' : ''}>
              {stats.cajaAbierta ? 'Abierta' : 'Cerrada'}
            </Badge>
            <p className="text-xs text-slate-500 mt-1">estado actual</p>
          </CardContent>
        </Card>
      </div>

      {/* Ventas recientes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventas recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {ventasRecientes.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No hay ventas hoy todavía</p>
          ) : (
            <div className="space-y-2">
              {ventasRecientes.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">Ticket #{v.invoice_number}</p>
                    <p className="text-xs text-slate-500">
                      {v.customers?.name || 'Cliente ocasional'} · {METODO_LABEL[v.payment_method] ?? v.payment_method}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">{fmt(v.total)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(v.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
