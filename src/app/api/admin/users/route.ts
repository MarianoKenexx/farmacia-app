import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

// Cliente admin con service_role_key (bypasea RLS y email confirmation)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function getCallerRole(request: NextRequest): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role ?? null
}

// POST — crear usuario
export async function POST(request: NextRequest) {
  const role = await getCallerRole(request)
  if (role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json()
  const { name, email, password, role: userRole, permissions } = body

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
  }

  // Crear en Supabase Auth (email ya confirmado, sin mail de verificación)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: userRole },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // El trigger handle_new_user crea el perfil automáticamente.
  // Hacemos upsert para asegurarnos de que quede con todos los datos.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: authData.user.id,
      email,
      name,
      role: userRole,
      permissions,
      active: true,
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, id: authData.user.id })
}

// PATCH — actualizar usuario (nombre, rol, permisos, activo, contraseña)
export async function PATCH(request: NextRequest) {
  const role = await getCallerRole(request)
  if (role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json()
  const { id, name, role: userRole, permissions, active, password } = body

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  // Reset de contraseña
  if (password) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Actualizar perfil
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (userRole !== undefined) updates.role = userRole
  if (permissions !== undefined) updates.permissions = permissions
  if (active !== undefined) updates.active = active

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

// DELETE — eliminar usuario
export async function DELETE(request: NextRequest) {
  const role = await getCallerRole(request)
  if (role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
