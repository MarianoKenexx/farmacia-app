// Reglas de acceso por rol, compartidas entre el servidor (proxy) y la interfaz.
//
// Los cajeros NUNCA ven las métricas ni los historiales de caja/ventas,
// sin importar qué permisos tengan marcados. Así no pueden ver cuánto
// "debería" haber en caja y ajustar el conteo al cerrar.

export type Role = 'superadmin' | 'admin' | 'cajero'

// Rutas que un cajero no puede abrir nunca
export const CAJERO_BLOCKED_ROUTES = ['/dashboard', '/historial', '/comandas', '/reportes', '/configuracion', '/alertas', '/recetas-pendientes', '/auditoria-precios', '/proveedores', '/compras', '/recompras']

// Secciones de permisos que no aplican a cajeros (solo admin/superadmin)
export const ADMIN_ONLY_SECTIONS = ['historial', 'reportes'] as const

// Orden en que se elige la pantalla de inicio de un cajero
const CAJERO_HOME_ORDER = ['pos', 'caja', 'productos', 'stock', 'clientes'] as const

export function isCajeroBlocked(pathname: string) {
  return CAJERO_BLOCKED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export function homeFor(role: string | undefined, permissions: Record<string, boolean> | null | undefined) {
  if (role !== 'cajero') return '/dashboard'
  const key = CAJERO_HOME_ORDER.find(k => !permissions || permissions[k] !== false)
  return key ? `/${key}` : '/sin-acceso'
}

// Lunes de esta semana / día 1 del mes, a las 00:00 (hora local)
export type Periodo = 'hoy' | 'semana' | 'mes' | 'todo'

export function inicioPeriodo(p: Periodo): Date | null {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (p === 'hoy') return d
  if (p === 'semana') {
    const dow = (d.getDay() + 6) % 7 // lunes = 0
    d.setDate(d.getDate() - dow)
    return d
  }
  if (p === 'mes') {
    d.setDate(1)
    return d
  }
  return null
}

export const PERIODO_LABEL: Record<Periodo, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  todo: 'Todo',
}
