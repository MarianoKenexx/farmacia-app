'use client'
import { useEffect, useState } from 'react'
import { ADMIN_ONLY_SECTIONS } from '@/lib/roles'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, X, KeyRound, ToggleLeft, ToggleRight } from 'lucide-react'
import type { Profile, Permissions, SectionKey } from '@/context/AuthContext'

const SECTIONS: { key: SectionKey; label: string; emoji: string }[] = [
  { key: 'pos', label: 'Punto de Venta', emoji: '🛒' },
  { key: 'productos', label: 'Productos', emoji: '📦' },
  { key: 'stock', label: 'Stock', emoji: '📊' },
  { key: 'clientes', label: 'Clientes', emoji: '👥' },
  { key: 'caja', label: 'Caja', emoji: '🏦' },
  { key: 'historial', label: 'Historial', emoji: '📋' },
  { key: 'reportes', label: 'Reportes', emoji: '📈' },
]

const DEFAULT_PERMISSIONS: Record<string, Permissions> = {
  superadmin: { pos: true, productos: true, stock: true, clientes: true, caja: true, historial: true, reportes: true },
  admin: { pos: true, productos: true, stock: true, clientes: true, caja: true, historial: true, reportes: true },
  cajero: { pos: true, productos: false, stock: false, clientes: true, caja: true, historial: false, reportes: false },
}

const roleLabel: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrador',
  cajero: 'Cajero',
}

const roleColor: Record<string, string> = {
  superadmin: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  admin: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cajero: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

type FormState = {
  name: string
  email: string
  password: string
  newPassword: string
  role: string
  permissions: Permissions
  active: boolean
}

const emptyForm = (): FormState => ({
  name: '', email: '', password: '', newPassword: '',
  role: 'cajero',
  permissions: { ...DEFAULT_PERMISSIONS.cajero },
  active: true,
})

export default function UsuariosPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingUser(null)
    setForm(emptyForm())
    setError('')
    setShowResetPw(false)
    setShowModal(true)
  }

  const openEdit = (p: Profile) => {
    setEditingUser(p)
    setForm({
      name: p.name,
      email: p.email,
      password: '',
      newPassword: '',
      role: p.role,
      permissions: p.permissions ?? { ...DEFAULT_PERMISSIONS[p.role] ?? DEFAULT_PERMISSIONS.cajero },
      active: p.active,
    })
    setError('')
    setShowResetPw(false)
    setShowModal(true)
  }

  const setPermission = (key: SectionKey, value: boolean) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: value } }))
  }

  const handleRoleChange = (newRole: string) => {
    setForm(f => ({
      ...f,
      role: newRole,
      permissions: { ...DEFAULT_PERMISSIONS[newRole] ?? DEFAULT_PERMISSIONS.cajero },
    }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (editingUser) {
      // Actualizar usuario existente
      const body: Record<string, unknown> = {
        id: editingUser.id,
        name: form.name,
        role: form.role,
        permissions: form.permissions,
        active: form.active,
      }
      if (showResetPw && form.newPassword) {
        body.password = form.newPassword
      }

      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setSaving(false); return }
    } else {
      // Crear usuario nuevo
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          permissions: form.permissions,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setSaving(false); return }
    }

    await load()
    setShowModal(false)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return
    const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
    if (res.ok) await load()
  }

  const handleToggleActive = async (p: Profile) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    })
    await load()
  }

  const activeCount = profiles.filter(p => p.active).length
  const permCount = (p: Profile) => {
    if (!p.permissions) return '—'
    const count = Object.values(p.permissions).filter(Boolean).length
    return `${count}/${SECTIONS.length}`
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-6 bg-violet-500 rounded-full" />
            <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          </div>
          <p className="text-slate-400 ml-5">
            {activeCount} activo{activeCount !== 1 ? 's' : ''} · {profiles.length} total
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-violet-500 hover:bg-violet-400 text-white font-medium px-4 py-2.5 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Nuevo usuario
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuario</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rol</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Secciones</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${
                    i === profiles.length - 1 ? 'border-b-0' : ''
                  } ${!p.active ? 'opacity-50' : ''}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-sm font-bold text-slate-300">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-white text-sm">{p.name}</div>
                        <div className="text-slate-500 text-xs">{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${roleColor[p.role] ?? ''}`}>
                      {roleLabel[p.role] ?? p.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {p.role === 'superadmin' ? (
                      <span className="text-xs text-violet-400">Acceso total</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {SECTIONS.map(s => {
                          const enabled = p.permissions ? p.permissions[s.key] : true
                          return enabled ? (
                            <span key={s.key} title={s.label} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                              {s.emoji}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleToggleActive(p)}
                      className="flex items-center gap-1.5 group"
                      title={p.active ? 'Desactivar' : 'Activar'}
                    >
                      {p.active ? (
                        <ToggleRight className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-500 group-hover:text-slate-300" />
                      )}
                      <span className={`text-xs ${p.active ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {p.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl my-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="font-semibold text-white text-lg">
                {editingUser ? `Editar · ${editingUser.name}` : 'Nuevo usuario'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Nombre */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Nombre completo</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  required
                />
              </div>

              {/* Email + Password (solo crear) */}
              {!editingUser && (
                <>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Contraseña inicial</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      minLength={6}
                      required
                    />
                  </div>
                </>
              )}

              {/* Reset password (solo editar) */}
              {editingUser && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowResetPw(v => !v)}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    <KeyRound className="w-4 h-4" />
                    {showResetPw ? 'Cancelar cambio de contraseña' : 'Cambiar contraseña'}
                  </button>
                  {showResetPw && (
                    <input
                      type="password"
                      placeholder="Nueva contraseña (mín. 6 caracteres)"
                      value={form.newPassword}
                      onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                      className="mt-2 w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      minLength={6}
                    />
                  )}
                </div>
              )}

              {/* Rol */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Rol</label>
                <select
                  value={form.role}
                  onChange={e => handleRoleChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="cajero">Cajero</option>
                  <option value="admin">Administrador</option>
                  <option value="superadmin">Super Admin</option>
                </select>
                {form.role === 'superadmin' && (
                  <p className="text-xs text-violet-400 mt-1.5">
                    Super Admin tiene acceso total a todas las secciones y al panel de administración.
                  </p>
                )}
              </div>

              {/* Permisos por sección */}
              {form.role !== 'superadmin' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-3">
                    Acceso a secciones
                    <span className="ml-2 text-xs text-slate-600">
                      ({Object.values(form.permissions).filter(Boolean).length}/{SECTIONS.length} habilitadas)
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SECTIONS.map(({ key, label, emoji }) => {
                      const soloAdmin = form.role === 'cajero' && (ADMIN_ONLY_SECTIONS as readonly string[]).includes(key)
                      const enabled = form.permissions[key] && !soloAdmin
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={soloAdmin}
                          title={soloAdmin ? 'Los cajeros no pueden ver esta sección' : undefined}
                          onClick={() => setPermission(key, !enabled)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            enabled
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'
                          }`}
                        >
                          <span className="text-base">{emoji}</span>
                          <span className="flex-1 text-left text-xs">{label}{soloAdmin && <span className="block text-[10px] text-slate-600">Solo administradores</span>}</span>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Estado activo (solo editar) */}
              {editingUser && (
                <div className="flex items-center justify-between py-2 border-t border-slate-700">
                  <div>
                    <p className="text-sm text-white font-medium">Cuenta activa</p>
                    <p className="text-xs text-slate-500">Un usuario inactivo no puede iniciar sesión</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                    className="transition-all"
                  >
                    {form.active ? (
                      <ToggleRight className="w-8 h-8 text-emerald-400 hover:text-emerald-300" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-500 hover:text-slate-400" />
                    )}
                  </button>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-violet-500 hover:bg-violet-400 text-white font-medium py-2.5 rounded-xl transition-all disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
