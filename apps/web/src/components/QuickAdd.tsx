import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts, useCategories } from '../lib/hooks'
import { parseAmount, today } from '../lib/format'
import type { Tx, TxType } from '../lib/types'

const TYPES: { v: TxType; label: string }[] = [
  { v: 'gasto', label: 'Gasto' }, { v: 'ingreso', label: 'Ingreso' }, { v: 'transferencia', label: 'Transferencia' },
]

export default function QuickAdd({ onClose, tx }: { onClose: () => void; tx?: Tx }) {
  const qc = useQueryClient()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const categories = (useCategories().data ?? []).filter((c) => c.active)
  const [type, setType] = useState<TxType>(tx?.type ?? 'gasto')
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount)).replace('.', ',') : '')
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? '')
  const [accountId, setAccountId] = useState(tx?.account_id ?? localStorage.getItem('lastAccount') ?? '')
  const [destId, setDestId] = useState(tx?.dest_account_id ?? '')
  const [description, setDescription] = useState(tx?.description ?? '')
  const [date, setDate] = useState(tx?.date ?? today())
  const [error, setError] = useState('')

  const effectiveAccount = accountId || accounts[0]?.id || ''
  const cats = categories.filter((c) => c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto'))
  const parents = cats.filter((c) => !c.parent_id)

  const save = useMutation({
    mutationFn: async () => {
      const n = parseAmount(amount)
      if (!n || isNaN(n)) throw new Error('Introduce un importe válido.')
      if (type === 'transferencia' && (!destId || destId === effectiveAccount)) throw new Error('Elige una cuenta de destino distinta.')
      const row = {
        type, amount: tx?.type === 'ajuste' ? n : Math.abs(n), date, account_id: effectiveAccount,
        dest_account_id: type === 'transferencia' ? destId : null,
        category_id: type === 'transferencia' ? null : categoryId || null,
        description: description.trim() || null,
      }
      const r = tx
        ? await supabase.from('transactions').update(row).eq('id', tx.id)
        : await supabase.from('transactions').insert(row)
      if (r.error) throw r.error
      localStorage.setItem('lastAccount', effectiveAccount)
    },
    onSuccess: () => { qc.invalidateQueries(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        className="bg-panel border border-line w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">{tx ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {tx?.type !== 'ajuste' && (
          <div className="grid grid-cols-3 gap-1 bg-raise p-1 rounded-lg" role="tablist">
            {TYPES.map((t) => (
              <button key={t.v} type="button" role="tab" aria-selected={type === t.v} onClick={() => setType(t.v)}
                className={`py-2 rounded-md text-sm ${type === t.v ? 'bg-brass text-ink font-semibold' : 'text-mute'}`}>{t.label}</button>
            ))}
          </div>
        )}

        <div><label className="label" htmlFor="amt">Importe (€)</label>
          <input id="amt" className="input text-2xl" inputMode="decimal" placeholder="0,00" value={amount}
            onChange={(e) => setAmount(e.target.value)} autoFocus /></div>

        {type !== 'transferencia' && tx?.type !== 'ajuste' && (
          <div><label className="label" htmlFor="cat">Categoría</label>
            <select id="cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sin categoría</option>
              {parents.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name}</option>
                  {cats.filter((c) => c.parent_id === p.id).map((c) => <option key={c.id} value={c.id}>{p.name} › {c.name}</option>)}
                </optgroup>
              ))}
            </select></div>
        )}

        <div><label className="label" htmlFor="acc">{type === 'transferencia' ? 'Cuenta de origen' : 'Cuenta'}</label>
          <select id="acc" className="input" value={effectiveAccount} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.entity} · {a.name}</option>)}
          </select></div>

        {type === 'transferencia' && (
          <div><label className="label" htmlFor="dst">Cuenta de destino</label>
            <select id="dst" className="input" value={destId} onChange={(e) => setDestId(e.target.value)}>
              <option value="">Elige cuenta</option>
              {accounts.filter((a) => a.id !== effectiveAccount).map((a) => <option key={a.id} value={a.id}>{a.entity} · {a.name}</option>)}
            </select></div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="dt">Fecha</label>
            <input id="dt" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="label" htmlFor="ds">Descripción</label>
            <input id="ds" className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>

        {accounts.length === 0 && <p className="text-brass text-sm">Crea primero una cuenta en la sección Cuentas.</p>}
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={save.isPending || accounts.length === 0}>Guardar</button>
      </form>
    </div>
  )
}
