import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  const isDashboard = pathname === '/dashboard' || pathname === '/'

  // Sin sesión → login
  if (!user && !isLoginPage) {
    return redirectTo(request, '/login')
  }

  // Con sesión en login → dashboard
  if (user && isLoginPage) {
    return redirectTo(request, '/dashboard')
  }

  // Las API routes las maneja el servidor internamente
  if (isApiRoute) return supabaseResponse

  if (user && !isLoginPage && !isDashboard) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, permissions, active')
      .eq('id', user.id)
      .single()

    // Usuario inactivo → logout
    if (!profile || profile.active === false) {
      return redirectTo(request, '/login')
    }

    // Panel admin: solo superadmin
    if (isAdminPage && profile.role !== 'superadmin') {
      return redirectTo(request, '/dashboard')
    }

    // Verificar permisos por sección (superadmin siempre pasa)
    if (profile.role !== 'superadmin') {
      const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find(
        route => pathname === route || pathname.startsWith(route + '/')
      )

      if (matchedRoute) {
        const permKey = ROUTE_PERMISSIONS[matchedRoute]
        const perms = profile.permissions as Record<string, boolean> | null

        // Si no tiene la sección habilitada → dashboard
        if (!perms || perms[permKey] === false) {
          return redirectTo(request, '/dashboard')
        }
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
