import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { today as todayStr } from './format'
import { compute, type Asset, type Contribution, type ValueRow } from './investCalc'

export type { Asset, Contribution, ValueRow, Position, MonthRow, YearRow } from './investCalc'

export const pctFmt = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined || isNaN(x) ? '—' : `${(x * 100).toFixed(digits).replace('.', ',')} %`

export function useInvestments() {
  const q = useQuery({
    queryKey: ['investments'],
    queryFn: async () => {
      const [a, c, v] = await Promise.all([
        supabase.from('assets').select('id,name,isin').is('deleted_at', null).order('name'),
        supabase.from('investment_contributions').select('*').order('date').order('created_at'),
        supabase.from('investment_values').select('*').order('date'),
      ])
      if (a.error) throw a.error
      if (c.error) throw c.error
      if (v.error) throw v.error
      return {
        assets: a.data as Asset[],
        contribs: (c.data as any[]).map((x) => ({ ...x, amount: Number(x.amount) })) as Contribution[],
        values: (v.data as any[]).map((x) => ({ ...x, value: Number(x.value) })) as ValueRow[],
      }
    },
  })
  const today = todayStr()
  const computed = useMemo(() => compute(q.data?.assets ?? [], q.data?.contribs ?? [], q.data?.values ?? [], today), [q.data, today])
  return { ...computed, today, isLoading: q.isLoading, error: q.error }
}
