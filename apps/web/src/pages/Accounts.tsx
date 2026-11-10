import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts } from '../lib/hooks'
import { money, parseAmount, today } from '../lib/format'
import { ACCOUNT_LABEL, type AccountType } from '../lib/types'

export default function Accounts() {
  const qc = useQueryClient()
  const accounts = useAccounts().data ?? []
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({ entity: '', name: '', type: 'corriente' as AccountType, initial: '0' })
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      if (!form.entity.trim() || !form.name.trim()) throw new Error('Indica la entidad y el nombre.')
      const { error } = await supabase.from('accounts').insert({
        entity: form.entity.trim(), name: form.name.trim(), type: form.type, initial_balance: parseAmount(form.initial) || 0,
      })
      if (error) throw error
    },
    onSuccess: () => { setForm({ entity: '', name: '', type: 'corriente', initial: '0' }); setError(''); qc.invalidateQueries() },
    onError: (e: Error) => setError(e.message),
  })
  const archive = useMutation({
    mutationFn: async (a: { id: string; archived: boolean }) => { await supabase.from('accounts').update({ archived: !a.archived }).eq('id', a.id) },
    onSuccess: () => qc.invalidateQueries(),
  })
  const adjust = useMutation({
    mutationFn: async (a: { id: string; balance: number }) => {
      const v = prompt('Saldo real actual de la cuenta (€):', String(a.balance).replace('.', ','))
      if (v === null) return
      const diff = parseAmount(v) - a.balance
      if (isNaN(diff) || Math.abs(diff) < 0.005) return
      const { error } = await supabase.from('transactions').insert({
        type: 'ajuste', amount: Math.round(diff * 100) / 100, date: today(), account_id: a.id, description: 'Ajuste de saldo',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(),
  })

  const visible = accounts.filter((a) => showArchived || !a.archived)
  const total = accounts.filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-white text-2xl font-bold">Cuentas</h1>
        <div className="text-right"><div className="text-mute text-sm">Total en cuentas</div><div className="text-white text-xl font-bold">{money(total)}</div></div>
      </div>

      {visible.length === 0 && <p className="text-mute">Aún no tienes cuentas. Crea la primera aquí abajo.</p>}
      <ul className="space-y-2">
        {visible.map((a) => (
          <li key={a.id} className={`card flex items-center gap-3 ${a.archived ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="text-white truncate">{a.entity} · {a.name}</div>
              <div className="text-xs text-mute">{ACCOUNT_LABEL[a.type]}{a.archived && ' · archivada'}</div>
            </div>
            <div className="text-white font-semibold">{money(a.balance)}</div>
            <button className="btn-ghost text-sm" onClick={() => adjust.mutate({ id: a.id, balance: a.balance })}>Ajustar</button>
            <button className="btn-ghost text-sm" onClick={() => archive.mutate(a)}>{a.archived ? 'Restaurar' : 'Archivar'}</button>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 text-sm text-mute">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar archivadas
      </label>

      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
        <h2 className="text-white font-semibold">Nueva cuenta</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="label" htmlFor="en">Entidad</label><input id="en" className="input" value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })} /></div>
          <div><label className="label" htmlFor="nm">Nombre</label><input id="nm" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="tp">Tipo</label>
            <select id="tp" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
              {Object.entries(ACCOUNT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label" htmlFor="ib">Saldo inicial (€)</label><input id="ib" className="input" inputMode="decimal" value={form.initial} onChange={(e) => setForm({ ...form, initial: e.target.value })} /></div>
        </div>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn" disabled={create.isPending}>Crear cuenta</button>
      </form>
    </div>
  )
}
