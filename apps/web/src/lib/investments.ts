import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { Book, daysBetween, monthlySeries, twr, xirrOf, type Op, type PricePoint } from './finance'
import { today as todayStr } from './format'

export type AssetType = 'accion' | 'etf' | 'fondo' | 'bono'
export const ASSET_LABEL: Record<AssetType, string> = { accion: 'Acciones', etf: 'ETF', fondo: 'Fondos de inversión', bono: 'Bonos y renta fija' }
export interface Asset { id: string; name: string; isin: string | null; type: AssetType }
export interface OpRow extends Op { id: string; account_id: string; notes: string | null }

export interface Position {
  asset: Asset; qty: number; price: number; priceDate: string | null
  value: number; cost: number; pnl: number; pnlPct: number | null; weight: number
  xirr: number | null; twr: number | null; firstBuy: string | null
}

export const pctFmt = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined || isNaN(x) ? '—' : `${(x * 100).toFixed(digits).replace('.', ',')} %`
export const qtyFmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(n)
export const isinOk = (s: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)

async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await make(i, i + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export function useInvestments() {
  const q = useQuery({
    queryKey: ['investments'],
    queryFn: async () => {
      const [assets, ops, prices] = await Promise.all([
        supabase.from('assets').select('*').is('deleted_at', null).order('name'),
        fetchAll<any>((f, t) => supabase.from('investment_operations').select('*').is('deleted_at', null).order('date').order('id').range(f, t)),
        fetchAll<any>((f, t) => supabase.from('asset_prices').select('asset_id,date,price').order('date').order('id').range(f, t)),
      ])
      if (assets.error) throw assets.error
      return {
        assets: assets.data as Asset[],
        ops: ops.map((o) => ({ ...o, quantity: Number(o.quantity), unit_price: Number(o.unit_price), fees: Number(o.fees) })) as OpRow[],
        prices: prices.map((p) => ({ ...p, price: Number(p.price) })) as PricePoint[],
      }
    },
  })

  const computed = useMemo(() => {
    const today = todayStr()
    const assets = q.data?.assets ?? []
    const ids = new Set(assets.map((a) => a.id))
    const ops = (q.data?.ops ?? []).filter((o) => ids.has(o.asset_id))
    const book = new Book(ops, q.data?.prices ?? [])
    const long = (first: string | null) => !!first && daysBetween(first, today) >= 30   // la rentabilidad anualizada no tiene sentido en pocos días

    const positions: Position[] = assets.map((asset) => {
      const qty = book.qty(asset.id, today)
      const pi = book.priceInfo(asset.id, today)
      const cost = book.costBasis(asset.id, today)
      const value = qty * pi.price
      const first = book.opsOf(asset.id).find((o) => o.type === 'compra')?.date ?? null
      return {
        asset, qty, price: pi.price, priceDate: pi.date, value, cost, pnl: value - cost,
        pnlPct: cost > 0 ? (value - cost) / cost : null, weight: 0,
        xirr: long(first) ? xirrOf(book, today, asset.id) : null, twr: twr(book, today, asset.id), firstBuy: first,
      }
    })
    const open = positions.filter((p) => p.qty > 1e-9)
    const totalValue = open.reduce((s, p) => s + p.value, 0)
    open.forEach((p) => { p.weight = totalValue > 0 ? p.value / totalValue : 0 })
    const cost = open.reduce((s, p) => s + p.cost, 0)
    const first = book.opDates()[0] ?? null
    const portfolio = {
      value: totalValue, cost, pnl: totalValue - cost, pnlPct: cost > 0 ? (totalValue - cost) / cost : null,
      xirr: long(first) ? xirrOf(book, today) : null, twr: twr(book, today), hasOps: !!first,
    }
    const byClass = (Object.keys(ASSET_LABEL) as AssetType[])
      .map((t) => ({ type: t, name: ASSET_LABEL[t], value: open.filter((p) => p.asset.type === t).reduce((s, p) => s + p.value, 0) }))
      .filter((c) => c.value > 0)
    return { book, ops, positions, open, portfolio, byClass, series: monthlySeries(book, today), today }
  }, [q.data])

  return { ...computed, assets: q.data?.assets ?? [], allOps: q.data?.ops ?? [], isLoading: q.isLoading, error: q.error }
}
