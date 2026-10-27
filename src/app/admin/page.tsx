'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Users, Tag, ShoppingBag, Activity, BookOpen, Trash2, DatabaseBackup, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'

export default function AdminPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ users: 0, categories: 0, products: 0 })

  useEffect(() => {
    const load = async () => {
      const [{ count: users }, { count: categories }, { count: products }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('categories').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }),
      ])
      setStats({ users: users ?? 0, categories: categories ?? 0, products: products ?? 0 })
    }
    load()
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-6 bg-violet-500 rounded-full" />
          <h1 className="text-2xl font-bold text-white">Panel de Administración</h1>
        </div>
        <p className="text-slate-400 ml-5">
          Bienvenido, <span className="text-violet-400 font-medium">{profile?.name}</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Usuarios', value: stats.users, icon: Users, color: 'violet' },
          { label: 'Categorías', value: stats.categories, icon: Tag, color: 'emerald' },
          { label: 'Productos', value: stats.products, icon: ShoppingBag, color: 'blue' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <div className={`w-10 h-10 bg-${color}-500/10 rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 text-${color}-400`} />
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-slate-400 text-sm">{label}</div>
          </div>
        ))}
      </div>

      {/* Accesos directos */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/admin/usuarios"
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-violet-500/50 rounded-2xl p-6 transition-all group"
        >
          <Users className="w-8 h-8 text-violet-400 mb-4" />
          <h3 className="font-semibold text-white text-lg mb-1">Gestión de Usuarios</h3>
          <p className="text-slate-400 text-sm">Crear, editar y asignar roles a los usuarios del sistema</p>
        </Link>

        <Link
          href="/admin/categorias"
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 rounded-2xl p-6 transition-all group"
        >
          <Tag className="w-8 h-8 text-emerald-400 mb-4" />
          <h3 className="font-semibold text-white text-lg mb-1">Categorías</h3>
          <p className="text-slate-400 text-sm">Administrar categorías de productos</p>
        </Link>

        <Link
          href="/admin/manual"
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-violet-500/50 rounded-2xl p-6 transition-all group"
        >
          <BookOpen className="w-8 h-8 text-violet-400 mb-4" />
          <h3 className="font-semibold text-white text-lg mb-1">Manual de uso</h3>
          <p className="text-slate-400 text-sm">Cómo funciona cada parte de la app, explicado en criollo</p>
        </Link>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 opacity-50 cursor-not-allowed">
          <Activity className="w-8 h-8 text-slate-500 mb-4" />
          <h3 className="font-semibold text-slate-400 text-lg mb-1">Reportes avanzados</h3>
          <p className="text-slate-500 text-sm">Próximamente</p>
        </div>

        <Link
          href="/admin/actualizar-precios"
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 rounded-2xl p-6 transition-all group"
        >
          <FileSpreadsheet className="w-8 h-8 text-amber-400 mb-4" />
          <h3 className="font-semibold text-white text-lg mb-1">Actualizar precios desde archivo</h3>
          <p className="text-slate-400 text-sm">Subir la lista de precios de la droguería y actualizar en bloque</p>
        </Link>

        <Link
          href="/admin/respaldo"
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 rounded-2xl p-6 transition-all group"
        >
          <DatabaseBackup className="w-8 h-8 text-emerald-400 mb-4" />
          <h3 className="font-semibold text-white text-lg mb-1">Respaldo de la base de datos</h3>
          <p className="text-slate-400 text-sm">Exportar todo a un archivo, o importar un respaldo guardado</p>
        </Link>

        <Link
          href="/admin/reiniciar"
          className="bg-slate-800 hover:bg-slate-700 border border-red-500/20 hover:border-red-500/50 rounded-2xl p-6 transition-all group"
        >
          <Trash2 className="w-8 h-8 text-red-400 mb-4" />
          <h3 className="font-semibold text-white text-lg mb-1">Reiniciar la app</h3>
          <p className="text-slate-400 text-sm">Borrar todos los datos de prueba para arrancar en cero</p>
        </Link>
      </div>
    </div>
  )
}
