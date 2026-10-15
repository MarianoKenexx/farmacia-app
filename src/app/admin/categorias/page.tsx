'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

interface Category {
  id: string
  name: string
  description: string | null
  created_at: string
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '' })
    setShowModal(true)
  }

  const openEdit = (c: Category) => {
    setEditing(c)
    setForm({ name: c.name, description: c.description ?? '' })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    if (editing) {
      await supabase.from('categories').update({ name: form.name, description: form.description || null }).eq('id', editing.id)
    } else {
      await supabase.from('categories').insert({ name: form.name, description: form.description || null })
    }
    await load()
    setShowModal(false)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría?')) return
    await supabase.from('categories').delete().eq('id', id)
    await load()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-6 bg-emerald-500 rounded-full" />
            <h1 className="text-2xl font-bold text-white">Categorías</h1>
          </div>
          <p className="text-slate-400 ml-5">Organizá los productos por categoría</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-medium px-4 py-2.5 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Nueva categoría
        </button>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Cargando...</div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-400 mb-2">No hay categorías todavía</p>
            <p className="text-slate-600 text-sm">Creá la primera para organizar los productos</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nombre</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Descripción</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c.id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${i === categories.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-5 py-4">
                    <span className="font-medium text-white">{c.name}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-sm">{c.description ?? '—'}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
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

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="font-semibold text-white">{editing ? 'Editar categoría' : 'Nueva categoría'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Descripción (opcional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 rounded-xl transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-2.5 rounded-xl transition-all disabled:opacity-50">
                  {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
