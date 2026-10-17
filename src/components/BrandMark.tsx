'use client'
import { useBranding } from '@/context/BrandingContext'

// Logo + nombre de la empresa (arriba a la izquierda y en el login)
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { settings } = useBranding()
  const { logo_url, business_name, tagline, show_name_with_logo } = settings
  const big = size === 'lg'

  if (logo_url) {
    return (
      <div className={`flex items-center gap-3 min-w-0 ${big ? 'flex-col text-center' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo_url}
          alt={business_name}
          className={`object-contain shrink-0 ${
            show_name_with_logo
              ? big ? 'h-16 max-w-[220px]' : 'h-10 max-w-[56px]'
              : big ? 'h-20 max-w-[260px]' : 'h-12 max-w-[200px]'
          }`}
        />
        {show_name_with_logo && (
          <div className="min-w-0">
            <h1 className={`font-bold text-white leading-tight truncate ${big ? 'text-xl' : 'text-sm'}`}>{business_name}</h1>
            {tagline && <p className={`text-slate-400 truncate ${big ? 'text-sm' : 'text-xs'}`}>{tagline}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 min-w-0 ${big ? 'flex-col text-center' : ''}`}>
      <div className={`bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 ${big ? 'w-14 h-14' : 'w-10 h-10'}`}>
        <span className={big ? 'text-2xl' : 'text-lg'}>💊</span>
      </div>
      <div className="min-w-0">
        <h1 className={`font-bold text-white leading-tight truncate ${big ? 'text-xl' : 'text-sm'}`}>{business_name}</h1>
        {tagline && <p className={`text-slate-400 truncate ${big ? 'text-sm' : 'text-xs'}`}>{tagline}</p>}
      </div>
    </div>
  )
}
