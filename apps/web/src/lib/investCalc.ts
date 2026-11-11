// Inversiones simples: aportaciones (dinero que metes) + valor mensual (dinero que tienes).
// Valor estimado de un activo en una fecha = último valor registrado hasta esa fecha
// + aportaciones posteriores a ese valor (se asume que valen lo aportado hasta que lo actualices).
// Esta misma regla está en SQL (investments_value_at), para que el patrimonio coincida.
export interface Asset { id: string; name: string; isin: string | null }
export interface Contribution { id: string; asset_id: string; date: string; amount: number; account_id: string | null; notes: string | null }
export interface ValueRow { id: string; asset_id: string; date: string; value: number }
export interface Position { asset: Asset; aportado: number; valor: number; ganado: number; pct: number | null; weight: number; lastDate: string | null }
export interface MonthRow { date: string; aportado: number; valor: number; ganado: number; monthContrib: number; monthGain: number; monthPct: number | null }
export interface YearRow { year: number; contrib: number; gain: number; pct: number | null }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const chain = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((g, x) => g * (1 + x), 1) - 1 : null }

export function compute(rawAssets: Asset[], rawContribs: Contribution[], rawValues: ValueRow[], today: string) {
  const ids = new Set(rawAssets.map((a) => a.id))
  const assets = rawAssets
  const contribs = rawContribs.filter((c) => ids.has(c.asset_id)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const values = rawValues.filter((v) => ids.has(v.asset_id)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const lastValueOf = (id: string, date: string): ValueRow | null => {
    let r: ValueRow | null = null
    for (const v of values) if (v.asset_id === id && v.date <= date) r = v
    return r
  }
  const contributedAt = (id: string, date: string) => contribs.reduce((s, c) => (c.asset_id === id && c.date <= date ? s + c.amount : s), 0)
  const estimateAt = (id: string, date: string) => {
    const lv = lastValueOf(id, date)
    const extra = contribs.reduce((s, c) => (c.asset_id === id && c.date <= date && (!lv || c.date > lv.date) ? s + c.amount : s), 0)
    return (lv?.value ?? 0) + extra
  }
  const totalAt = (date: string) => assets.reduce((s, a) => s + estimateAt(a.id, date), 0)
  const contributedTotalAt = (date: string) => assets.reduce((s, a) => s + contributedAt(a.id, date), 0)

  const positions: Position[] = assets
    .filter((a) => contribs.some((c) => c.asset_id === a.id) || values.some((v) => v.asset_id === a.id))
    .map((asset) => {
      const aportado = contributedAt(asset.id, today), valor = estimateAt(asset.id, today)
      return {
        asset, aportado, valor, ganado: valor - aportado, pct: aportado > 0 ? (valor - aportado) / aportado : null, weight: 0,
        lastDate: lastValueOf(asset.id, today)?.date ?? contribs.find((c) => c.asset_id === asset.id)?.date ?? null,
      }
    })
  const total = positions.reduce((s, p) => s + p.valor, 0)
  positions.forEach((p) => { p.weight = total > 0 ? p.valor / total : 0 })
  const aportado = positions.reduce((s, p) => s + p.aportado, 0)
  const portfolio = { value: total, cost: aportado, pnl: total - aportado, pnlPct: aportado > 0 ? (total - aportado) / aportado : null, hasOps: contribs.length > 0 }

  // Mes a mes. El mes en curso solo aparece si ya has registrado un valor dentro de él.
  const series: MonthRow[] = []
  const dates = [...contribs.map((c) => c.date), ...values.map((v) => v.date)].sort()
  if (dates.length) {
    let y = +dates[0].slice(0, 4), m = +dates[0].slice(5, 7)
    const ey = +today.slice(0, 4), em = +today.slice(5, 7)
    let prev = { aportado: 0, valor: 0 }
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${pad(m)}`
      if (!(y === ey && m === em) || values.some((v) => v.date.startsWith(key))) {
        let d = ymd(new Date(y, m, 0))
        if (d > today) d = today
        const ap = contributedTotalAt(d), va = totalAt(d)
        const monthContrib = ap - prev.aportado
        const monthGain = va - prev.valor - monthContrib
        const denom = prev.valor + monthContrib
        series.push({ date: d, aportado: ap, valor: va, ganado: va - ap, monthContrib, monthGain, monthPct: denom > 0 ? monthGain / denom : null })
        prev = { aportado: ap, valor: va }
      }
      m++; if (m > 12) { m = 1; y++ }
    }
  }

  const years: YearRow[] = []
  for (const r of series) {
    const yr = +r.date.slice(0, 4)
    let row = years.find((x) => x.year === yr)
    if (!row) { row = { year: yr, contrib: 0, gain: 0, pct: null }; years.push(row) }
    row.contrib += r.monthContrib; row.gain += r.monthGain
  }
  for (const row of years) row.pct = chain(series.filter((r) => +r.date.slice(0, 4) === row.year).map((r) => r.monthPct))
  const totalPct = chain(series.map((r) => r.monthPct))

  const [ty, tm] = [+today.slice(0, 4), +today.slice(5, 7)]
  const lastPrev = ymd(new Date(ty, tm - 1, 0))      // último día del mes anterior
  const pending = positions.some((p) => p.valor > 0.005 && (!p.lastDate || p.lastDate < lastPrev))

  return { assets, contribs, values, positions, portfolio, series, years, totalPct, pending, lastPrev, estimateAt, lastValueOf }
}
