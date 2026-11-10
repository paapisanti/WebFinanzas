import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts } from '../lib/hooks'
import { money, parseAmount, today } from '../lib/format'
import { ACCOUNT_LABEL, type AccountType, type AccountWithBalance } from '../lib/types'

interface FormState { entity: string; name: string; type: AccountType; description: string; initial: string }
const EMPTY: FormState = { entity: '', name: '', type: 'corriente', description: '', initial: '0' }

export default function Accounts() {
  const qc = useQueryClient()
  const accounts = useAccounts().data ?? []
  const formRef = useRef<HTMLFormElement>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')

  const reset = () => { setEditingId(null); setForm(EMPTY); setError('') }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.entity.trim() || !form.name.trim()) throw new Error('Indica la entidad y el nombre.')
      const row = {
        entity: form.entity.trim(), name: form.name.trim(), type: form.type,
        description: form.description.trim() || null, initial_balance: parseAmount(form.initial) || 0,
      }
      const r = editingId
        ? await supabase.from('accounts').update(row).eq('id', editingId)
        : await supabase.from('accounts').insert(row)
      if (r.error) throw r.error
    },
    onSuccess: () => { reset(); qc.invalidateQueries() },
    onError: (e: Error) => setError(e.message),
  })

  function startEdit(a: AccountWithBalance) {
    setEditingId(a.id)
    setForm({ entity: a.entity, name: a.name, type: a.type, description: a.description ?? '', initial: String(a.initial_balance).replace('.', ',') })
    setError('')
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  const archive = useMutation({
    mutationFn: async (a: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('accounts').update({ archived: !a.archived }).eq('id', a.id)
      if (error) throw error
    },
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

  // Sin movimientos: se borra del todo. Con movimientos: se oculta y se conserva el historial.
  const remove = useMutation({
    mutationFn: async (a: AccountWithBalance) => {
      const [t, o] = await Promise.all([
        supabase.from('transactions').select('id', { count: 'exact', head: true }).or(`account_id.eq.${a.id},dest_account_id.eq.${a.id}`),
        supabase.from('investment_operations').select('id', { count: 'exact', head: true }).eq('account_id', a.id),
      ])
      if (t.error) throw t.error
      if (o.error) throw o.error
      const n = (t.count ?? 0) + (o.count ?? 0)
      const msg = n === 0
        ? `¿Eliminar "${a.name}"? No se puede deshacer.`
        : `"${a.name}" tiene ${n} movimientos. Se ocultará de la app y su saldo dejará de contar en tu patrimonio, pero el historial de ingresos y gastos se conserva en los informes. ¿Continuar?`
      if (!confirm(msg)) return
      const r = n === 0
        ? await supabase.from('accounts').delete().eq('id', a.id)
        : await supabase.from('accounts').update({ deleted_at: new Date().toISOString(), archived: true }).eq('id', a.id)
      if (r.error) throw r.error
      if (editingId === a.id) reset()
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => setError(`No se pudo eliminar: ${e.message}. Si tiene suscripciones asociadas, cámbialas de cuenta primero.`),
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
          <li key={a.id} className={`card ${a.archived ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-white truncate">{a.entity} · {a.name}</div>
                <div className="text-xs text-mute truncate">{ACCOUNT_LABEL[a.type]}{a.description && ` · ${a.description}`}{a.archived && ' · archivada'}</div>
              </div>
              <div className="text-white font-semibold">{money(a.balance)}</div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="btn-ghost text-sm" onClick={() => startEdit(a)}>Editar</button>
              <button className="btn-ghost text-sm" onClick={() => adjust.mutate({ id: a.id, balance: a.balance })}>Ajustar saldo</button>
              <button className="btn-ghost text-sm" onClick={() => archive.mutate(a)}>{a.archived ? 'Restaurar' : 'Archivar'}</button>
              <button className="btn-ghost text-sm text-neg" onClick={() => remove.mutate(a)}>Eliminar</button>
            </div>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 text-sm text-mute">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar archivadas
      </label>

      <form ref={formRef} className="card space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <h2 className="text-white font-semibold">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="label" htmlFor="en">Entidad</label><input id="en" className="input" value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })} /></div>
          <div><label className="label" htmlFor="nm">Nombre</label><input id="nm" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="tp">Tipo</label>
            <select id="tp" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
              {Object.entries(ACCOUNT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label" htmlFor="ib">Saldo inicial (€)</label><input id="ib" className="input" inputMode="decimal" value={form.initial} onChange={(e) => setForm({ ...form, initial: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label" htmlFor="ds">Descripción (opcional)</label><input id="ds" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        {editingId && <p className="text-xs text-mute">El saldo actual es el saldo inicial más los movimientos. Si solo quieres corregir el saldo sin tocar nada más, usa «Ajustar saldo».</p>}
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button className="btn" disabled={save.isPending}>{editingId ? 'Guardar cambios' : 'Crear cuenta'}</button>
          {editingId && <button type="button" className="btn-ghost" onClick={reset}>Cancelar</button>}
        </div>
      </form>
    </div>
  )
}
