'use client'
// Nombre, logo y datos del ticket de la empresa. Se guardan en la base,
// así se ven igual en todas las computadoras y celulares.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface AppSettings {
  business_name: string
  tagline: string
  logo_url: string | null
  show_name_with_logo: boolean
  ticket_logo_url: string | null
  ticket_show_logo: boolean
  ticket_name: string | null
  ticket_address: string | null
  ticket_cuit: string | null
  ticket_phone: string | null
  ticket_footer: string | null
  owner_email: string | null
  notify_on_close: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  business_name: 'Farmacia',
  tagline: 'Sistema de Gestión',
  logo_url: null,
  show_name_with_logo: true,
  ticket_logo_url: null,
  ticket_show_logo: false,
  ticket_name: null,
  ticket_address: null,
  ticket_cuit: null,
  ticket_phone: null,
  ticket_footer: '¡Gracias por su compra!',
  owner_email: null,
  notify_on_close: true,
}

interface BrandingContextType {
  settings: AppSettings
  loaded: boolean
  refresh: () => Promise<void>
  save: (changes: Partial<AppSettings>) => Promise<string | null>
}

const BrandingContext = createContext<BrandingContextType>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  refresh: async () => {},
  save: async () => null,
})

const CACHE_KEY = 'farmacia.branding'

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
    if (data) {
      const s = { ...DEFAULT_SETTINGS, ...data } as AppSettings
      setSettings(s)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)) } catch { /* sin almacenamiento */ }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    // Mostrar enseguida lo último conocido, y después actualizar desde la base
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
    } catch { /* sin almacenamiento */ }
    refresh()
  }, [refresh])

  useEffect(() => {
    document.title = settings.business_name || 'Farmacia'
  }, [settings.business_name])

  const save = useCallback(async (changes: Partial<AppSettings>) => {
    const { error } = await supabase
      .from('app_settings')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) return error.message
    await refresh()
    return null
  }, [refresh])

  return (
    <BrandingContext.Provider value={{ settings, loaded, refresh, save }}>
      {children}
    </BrandingContext.Provider>
  )
}

export const useBranding = () => useContext(BrandingContext)

// Sube un logo a la carpeta pública "branding" y devuelve su dirección
export async function uploadLogo(file: File, kind: 'menu' | 'ticket'): Promise<{ url?: string; error?: string }> {
  const okTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
  if (!okTypes.includes(file.type)) return { error: 'El archivo tiene que ser PNG, JPG, SVG o WebP.' }
  if (file.size > 2 * 1024 * 1024) return { error: 'La imagen pesa más de 2 MB. Probá con una más liviana.' }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${kind}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: false })
  if (error) return { error: error.message }
  const { data } = supabase.storage.from('branding').getPublicUrl(path)
  return { url: data.publicUrl }
}
