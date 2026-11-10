// Cálculos de rentabilidad. Sin dependencias: se puede probar con Node.
export interface Flow { date: string; amount: number }           // negativo = sale de tu bolsillo
export interface Op { id?: string; asset_id: string; type: 'compra' | 'venta'; date: string; quantity: number; unit_price: number; fees: number; created_at?: string }
export interface PricePoint { asset_id: string; date: string; price: number }

const DAY = 86400000
const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY
export const daysBetween = (a: string, b: string) => Math.round(dayNum(b) - dayNum(a))

/** Flujo de caja de una operación: compra = sale dinero (incluye comisión), venta = entra dinero (menos comisión). */
export const opFlow = (o: Op) => {
  const gross = o.quantity * o.unit_price
  return o.type === 'compra' ? -(gross + o.fees) : gross - o.fees
}

/** Rentabilidad anualizada que tiene en cuenta cuándo aportaste cada importe. null si no se puede calcular. */
export function xirr(flows: Flow[]): number | null {
  const f = flows.filter((x) => x.amount !== 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (f.length < 2 || !f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null
  const t0 = dayNum(f[0].date)
  const npv = (r: number) => f.reduce((s, x) => s + x.amount / Math.pow(1 + r, (dayNum(x.date) - t0) / 365), 0)
  let lo = -0.9999, hi = 10
  const flo = npv(lo)
  let fhi = npv(hi)
  while (flo * fhi > 0 && hi < 1e6) { hi *= 10; fhi = npv(hi) }
  if (flo * fhi > 0) return null
  let a = lo, b = hi, fa = flo
  for (let i = 0; i < 400; i++) {
    const m = (a + b) / 2, fm = npv(m)
    if (Math.abs(fm) < 1e-9) return m
    if (fa * fm < 0) b = m
    else { a = m; fa = fm }
  }
  return (a + b) / 2
}

/** Índice de operaciones y precios para valorar la cartera en cualquier fecha. */
export class Book {
  private ops = new Map<string, Op[]>()
  private prices = new Map<string, PricePoint[]>()
  constructor(ops: Op[], prices: PricePoint[]) {
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    for (const o of [...ops].sort((a, b) => cmp(a.date, b.date) || cmp(a.created_at ?? '', b.created_at ?? ''))) {
      if (!this.ops.has(o.asset_id)) this.ops.set(o.asset_id, [])
      this.ops.get(o.asset_id)!.push(o)
    }
    for (const p of [...prices].sort((a, b) => cmp(a.date, b.date))) {
      if (!this.prices.has(p.asset_id)) this.prices.set(p.asset_id, [])
      this.prices.get(p.asset_id)!.push(p)
    }
  }
  assets(only?: string): string[] { return only ? (this.ops.has(only) ? [only] : []) : [...this.ops.keys()] }
  opsOf(asset: string): Op[] { return this.ops.get(asset) ?? [] }
  opDates(only?: string): string[] {
    const s = new Set<string>()
    for (const a of this.assets(only)) for (const o of this.opsOf(a)) s.add(o.date)
    return [...s].sort()
  }
  qty(asset: string, date: string): number {
    return this.opsOf(asset).reduce((s, o) => (o.date <= date ? s + (o.type === 'compra' ? o.quantity : -o.quantity) : s), 0)
  }
  /** Último precio conocido hasta esa fecha (tabla de precios; si no hay, el de la última operación). */
  priceInfo(asset: string, date: string): { price: number; date: string | null } {
    const ps = this.prices.get(asset) ?? []
    for (let i = ps.length - 1; i >= 0; i--) if (ps[i].date <= date) return { price: ps[i].price, date: ps[i].date }
    const os = this.opsOf(asset).filter((o) => o.date <= date)
    return os.length ? { price: os[os.length - 1].unit_price, date: os[os.length - 1].date } : { price: 0, date: null }
  }
  price(asset: string, date: string) { return this.priceInfo(asset, date).price }
  value(date: string, only?: string): number {
    return this.assets(only).reduce((s, a) => s + this.qty(a, date) * this.price(a, date), 0)
  }
  /** Coste de lo que queda en cartera por coste medio ponderado. */
  costBasis(asset: string, date: string): number {
    let q = 0, cost = 0
    for (const o of this.opsOf(asset)) {
      if (o.date > date) break
      if (o.type === 'compra') { q += o.quantity; cost += o.quantity * o.unit_price + o.fees }
      else if (q > 0) { cost -= cost * Math.min(o.quantity / q, 1); q -= o.quantity }
    }
    return q > 1e-9 ? cost : 0
  }
  flows(date: string, only?: string): Flow[] {
    const out: Flow[] = []
    for (const a of this.assets(only)) for (const o of this.opsOf(a)) if (o.date <= date) out.push({ date: o.date, amount: opFlow(o) })
    return out
  }
}

/** Rentabilidad ponderada por tiempo: encadena los tramos entre aportaciones, así no depende de cuándo ni cuánto aportas. */
export function twr(book: Book, today: string, only?: string): number | null {
  const dates = book.opDates(only).filter((d) => d <= today)
  if (!dates.length) return null
  let g = 1
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i], next = dates[i + 1] ?? today
    if (next <= d) continue
    let start = 0, end = 0
    for (const a of book.assets(only)) {
      const q = book.qty(a, d)
      start += q * book.price(a, d)
      end += q * book.price(a, next)
    }
    if (start > 0) g *= end / start
  }
  return g - 1
}

/** XIRR de cartera o de un activo: todas las operaciones más el valor actual como cobro final. */
export function xirrOf(book: Book, today: string, only?: string): number | null {
  const fl = book.flows(today, only)
  if (!fl.length) return null
  const v = book.value(today, only)
  return xirr([...fl, { date: today, amount: v }])
}

export interface SeriesPoint { date: string; value: number; contributed: number }
/** Valor de la cartera y aportación neta acumulada a fin de cada mes (el último punto es hoy). */
export function monthlySeries(book: Book, today: string): SeriesPoint[] {
  const first = book.opDates()[0]
  if (!first) return []
  const out: SeriesPoint[] = []
  let y = +first.slice(0, 4), m = +first.slice(5, 7)
  const endY = +today.slice(0, 4), endM = +today.slice(5, 7)
  while (y < endY || (y === endY && m <= endM)) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    let d = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    if (d > today) d = today
    out.push({ date: d, value: book.value(d), contributed: -book.flows(d).reduce((s, f) => s + f.amount, 0) })
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}
