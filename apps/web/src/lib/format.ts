const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
export const money = (n: number | null | undefined) => eur.format(Number(n ?? 0))
export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())
export const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
export const fmtDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
export const fmtMonth = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
// Acepta "12,5" o "12.5"
export const parseAmount = (s: string) => Number(s.replace(',', '.'))
