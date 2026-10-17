// Formatos de números para mostrar en pantalla.

// Stock en cajas: se corta en 1 decimal (24,6667 → 24,6). Si es entero, sin decimales.
export function fmtStock(n: number | string | null | undefined) {
  const v = Number(n ?? 0)
  const t = Math.trunc(v * 10 + (v >= 0 ? 1e-9 : -1e-9)) / 10
  return t.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

// Stock en unidades sueltas (comprimidos, sobres...), siempre entero
export function fmtUnidades(stockCajas: number | string, unidadesPorEnvase: number) {
  return Math.round(Number(stockCajas) * unidadesPorEnvase).toLocaleString('es-AR')
}
