import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts, useCategories } from '../lib/hooks'
import { addMonths, fmtDate, money, monthStart, today, ymd } from '../lib/format'
import type { Tx } from '../lib/types'
import QuickAdd from '../components/QuickAdd'

export default function Transactions() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(today().slice(0, 7))
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [editing, setEditing] = useState<Tx | undefined>()
  const accounts = useAccounts().data ?? []
  const categories = useCategories().data ?? []

  const list = useQuery({
    queryKey: ['transactions', month],
    queryFn: async () => {
      const from = new Date(month + '-01T00:00:00')
      const { data, error } = await supabase.from('transactions').select('*')
        .gte('date', ymd(monthStart(from))).lt('date', ymd(addMonths(from, 1)))
        .order('date', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      return data as Tx[]
    },
  })

  const refresh = () => qc.invalidateQueries()
  const cancel = useMutation({
    mutationFn: async (t: Tx) => { await supabase.from('transactions').update({ status: 'anulado' }).eq('id', t.id) },
    onSuccess: refresh,
  })
  const dup = useMutation({
    mutationFn: async (t: Tx) => {
      const { id, status, source, ...rest } = t as any
      await supabase.from('transactions').insert({ ...rest, date: today() })
    },
    onSuccess: refresh,
  })

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? ''
  const rows = (list.data ?? []).filter((t) =>
    (!categoryId || t.category_id === categoryId) &&
    (!accountId || t.account_id === accountId || t.dest_account_id === accountId) &&
    (!q || (t.description ?? '').toLowerCase().includes(q.toLowerCase()) || catName(t.category_id).toLowerCase().includes(q.toLowerCase())))

  const sign = (t: Tx) => (t.type === 'gasto' ? -1 : t.type === 'ingreso' ? 1 : t.type === 'ajuste' ? Math.sign(t.amount) : 0)

  return (
    <div className="space-y-4">
      <h1 className="text-white text-2xl font-bold">Movimientos</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes" />
        <input className="input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {list.isLoading && <p className="text-mute">Cargando…</p>}
      {!list.isLoading && rows.length === 0 && <p className="text-mute">No hay movimientos en este periodo. Pulsa + para añadir el primero.</p>}

      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.id} className={`card flex items-center gap-3 ${t.status === 'anulado' ? 'opacity-40' : ''}`}>
            <div className="w-12 text-mute text-sm">{fmtDate(t.date)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-white truncate">
                {t.description || (t.type === 'transferencia' ? 'Transferencia' : catName(t.category_id) || 'Sin descripción')}
                {t.source === 'telegram' && <span className="ml-2 text-xs text-mute">Telegram</span>}
              </div>
              <div className="text-xs text-mute truncate">
                {t.type === 'transferencia' ? `${accName(t.account_id)} → ${accName(t.dest_account_id)}` : `${catName(t.category_id) || 'Sin categoría'} · ${accName(t.account_id)}`}
                {t.status === 'anulado' && ' · anulado'}
              </div>
            </div>
            <div className={`font-semibold ${t.type === 'transferencia' ? 'text-soft' : sign(t) > 0 ? 'text-pos' : 'text-neg'}`}>
              {sign(t) < 0 ? '−' : sign(t) > 0 ? '+' : ''}{money(Math.abs(t.amount))}
            </div>
            {t.status === 'activo' && (
              <div className="flex gap-1">
                <button className="btn-ghost text-sm" onClick={() => setEditing(t)}>Editar</button>
                <button className="btn-ghost text-sm hidden md:inline-flex" onClick={() => dup.mutate(t)}>Duplicar</button>
                <button className="btn-ghost text-sm" onClick={() => confirm('¿Anular este movimiento?') && cancel.mutate(t)}>Anular</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && <QuickAdd tx={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}
