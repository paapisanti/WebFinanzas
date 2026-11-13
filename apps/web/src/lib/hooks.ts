import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { AccountWithBalance, Category } from './types'

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async (): Promise<AccountWithBalance[]> => {
      const [a, b] = await Promise.all([
        supabase.from('accounts').select('*').is('deleted_at', null).order('created_at'),
        supabase.from('account_balances').select('account_id,balance'),
      ])
      if (a.error) throw a.error
      if (b.error) throw b.error
      const m = new Map<string, number>((b.data ?? []).map((r) => [r.account_id as string, Number(r.balance)]))
      return (a.data as any[]).map((x) => ({ ...x, balance: m.get(x.id) ?? Number(x.initial_balance) }))
    },
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('sort').order('name')
      if (error) throw error
      return data as Category[]
    },
  })
}

export function useAdvanced(enabled = true) {
  return useQuery({
    queryKey: ['advanced'],
    enabled,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase.from('settings').select('advanced_mode').maybeSingle()
      return !!(data as { advanced_mode?: boolean } | null)?.advanced_mode
    },
  })
}
