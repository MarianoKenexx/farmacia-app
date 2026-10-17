import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { homeFor, isCajeroBlocked } from '@/lib/roles'

// Mapeo ruta → clave de permiso
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/pos': 'pos',
  '/productos': 'productos',
  '/stock': 'stock',
  '/clientes': 'clientes',
  '/caja': 'caja',
  '/historial': 'historial',
  '/reportes': 'reportes',
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const isLoginPage = pathname === '/login'
  const isAdminPage = pathname.startsWith('/admin')
  const isApiRoute = pathname.startsWith('/api')
  const isRoot = pathname === '/'
  const isSinAcceso = pathname === '/sin-acceso'

  // Sin sesión → login
  if (!user && !isLoginPage) {
    return redirectTo(request, '/login')
  }

  // Las API routes las maneja el servidor internamente
  if (isApiRoute) return supabaseResponse

  if (!user) return supabaseResponse

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, active')
    .eq('id', user.id)
    .single()

  // Usuario inactivo o sin perfil → login
  if (!profile || profile.active === false) {
    return isLoginPage ? supabaseResponse : redirectTo(request, '/login')
  }

  const perms = profile.permissions as Record<string, boolean> | null
  const home = homeFor(profile.role, perms)

  // Con sesión en login o en la raíz → su pantalla de inicio
  if (isLoginPage || isRoot) {
    return redirectTo(request, home)
  }

  if (isSinAcceso) return supabaseResponse

  // Panel admin: solo superadmin
  if (isAdminPage && profile.role !== 'superadmin') {
    return redirectTo(request, home)
  }

  // Cajeros: nunca dashboard, historial ni reportes
  if (profile.role === 'cajero' && isCajeroBlocked(pathname)) {
    return redirectTo(request, home)
  }

  // Verificar permisos por sección (superadmin siempre pasa)
  if (profile.role !== 'superadmin') {
    const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find(
      route => pathname === route || pathname.startsWith(route + '/')
    )

    if (matchedRoute) {
      const permKey = ROUTE_PERMISSIONS[matchedRoute]
      if (!perms || perms[permKey] === false) {
        return redirectTo(request, home === pathname ? '/sin-acceso' : home)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js|webmanifest)$).*)',
  ],
}
