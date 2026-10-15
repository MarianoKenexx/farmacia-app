'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Customer } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Search, Users } from 'lucide-react'

const empty = { name: '', phone: '', email: '', dni: '' }

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers(data || [])
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('customers').insert(form)
    setSaving(false)
    setOpen(false)
    setForm(empty)
    fetchCustomers()
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dni?.includes(search) || c.phone?.includes(search)
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="text-sm text-slate-500">{customers.length} clientes registrados</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" /> Nuevo cliente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-9" placeholder="Buscar por nombre, DNI o teléfono..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-slate-400">No hay clientes</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-4 py-3 font-medium text-slate-600">Nombre</th>
                  <th className="px-4 py-3 font-medium text-slate-600">DNI</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Teléfono</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Email</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.dni || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>DNI</Label><Input value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} /></div>
            <div><Label>Teléfono</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
