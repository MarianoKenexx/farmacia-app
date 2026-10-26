'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Users,
  Landmark,
  Settings,
  LogOut,
  ChevronRight,
  History,
  BarChart2,
  SlidersHorizontal,
  Bell,
  HeartPulse,
  ScrollText,
  Truck,
  RefreshCw,
  Receipt,
} from 'lucide-react'
import { useAlerts } from '@/context/AlertsContext'
import { BrandMark } from '@/components/BrandMark'
import { useAuth, type SectionKey } from '@/context/AuthContext'
import { isCajeroBlocked } from '@/lib/roles'

const allNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permKey: null },
  { href: '/pos', label: 'Despacho', icon: ShoppingCart, permKey: 'pos' as SectionKey },
  { href: '/productos', label: 'Productos', icon: Package, permKey: 'productos' as SectionKey },
  { href: '/stock', label: 'Stock', icon: BarChart3, permKey: 'stock' as SectionKey },
  { href: '/clientes', label: 'Clientes', icon: Users, permKey: 'clientes' as SectionKey },
  { href: '/caja', label: 'Caja', icon: Landmark, permKey: 'caja' as SectionKey },
  { href: '/cobros', label: 'Cobros', icon: Receipt, permKey: 'caja' as SectionKey },
  { href: '/historial', label: 'Historial', icon: History, permKey: 'historial' as SectionKey },
  { href: '/reportes', label: 'Reportes', icon: BarChart2, permKey: 'reportes' as SectionKey },
  { href: '/recetas-pendientes', label: 'Recetas pendientes', icon: HeartPulse, permKey: 'reportes' as SectionKey },
  { href: '/auditoria-precios', label: 'Auditoría de precios', icon: ScrollText, permKey: 'reportes' as SectionKey },
  { href: '/proveedores', label: 'Proveedores y compras', icon: Truck, permKey: 'stock' as SectionKey },
  { href: '/recompras', label: 'Recompras', icon: RefreshCw, permKey: 'reportes' as SectionKey },
  { href: '/alertas', label: 'Alertas', icon: Bell, permKey: null },
  { href: '/configuracion', label: 'Configuración', icon: SlidersHorizontal, permKey: null },
]

const roleLabel: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrador',
  cajero: 'Cajero',
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const { unread } = useAlerts()

  if (pathname === '/login') return null

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  // Filtrar nav según permisos (superadmin ve todo)
  const navItems = allNavItems.filter(({ href, permKey }) => {
    if (!profile) return false
    // Cajeros nunca ven dashboard, historial ni reportes
    if (profile.role === 'cajero' && isCajeroBlocked(href)) return false
    if (!permKey) return true
    if (profile.role === 'superadmin') return true
    const perms = profile.permissions
    if (!perms) return true
    return perms[permKey] !== false
  })

  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-full border-r border-slate-800 shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-slate-800">
        <BrandMark />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                active
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-white'
                }`}
              />
              {label}
              {href === '/alertas' && unread > 0 && (
                <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              {active && href !== '/alertas' && (
                <ChevronRight className="w-3 h-3 ml-auto text-emerald-400/50" />
              )}
            </Link>
          )
        })}

        {/* Admin — solo superadmin */}
        {profile?.role === 'superadmin' && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Administración
              </p>
            </div>
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                pathname.startsWith('/admin')
                  ? 'bg-violet-500/10 text-violet-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings
                className={`w-4 h-4 shrink-0 ${
                  pathname.startsWith('/admin')
                    ? 'text-violet-400'
                    : 'text-slate-500 group-hover:text-white'
                }`}
              />
              Panel Admin
            </Link>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-slate-800">
        {profile ? (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-emerald-400">
                {profile.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{profile.name}</p>
              <p className="text-xs text-slate-500">{roleLabel[profile.role] ?? profile.role}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="px-2 py-2 text-xs text-slate-600">Cargando...</div>
        )}
      </div>
    </aside>
  )
}
