import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts, useCategories } from '../lib/hooks'
import { fmtDate, money, parseAmount, today } from '../lib/format'
import AddButton from '../components/AddButton'

const FREQ = { semanal: 'Semanal', mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' } as const
type Freq = keyof typeof FREQ
const FACTOR: Record<Freq, number> = { semanal: 52 / 12, mensual: 1, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12 }

interface Sub {
  id: string; name: string; category_id: string | null; amount: number; frequency: Freq
  start_date: string; next_charge_date: string; account_id: string | null; status: 'activa' | 'cancelada'
}
interface Form { name: string; categoryId: string; amount: string; frequency: Freq; start: string; next: string; accountId: string }

const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
const when = (d: string) => { const n = daysUntil(d); return n < 0 ? `vencido hace ${-n} d` : n === 0 ? 'hoy' : `en ${n} d` }

export default function Subscriptions() {
  const qc = useQueryClient()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const categories = (useCategories().data ?? []).filter((c) => c.kind === 'gasto' && c.active)
  const defCat = categories.find((c) => c.name === 'Suscripciones')?.id ?? ''
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Sin categoría'
  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? ''

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Form>({ name: '', categoryId: '', amount: '', frequency: 'mensual', start: today(), next: today(), accountId: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const subs = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async (): Promise<Sub[]> => {
      const { data, error } = await supabase.from('subscriptions').select('*').order('next_charge_date')
      if (error) throw error
      return (data as any[]).map((s) => ({ ...s, amount: Number(s.amount) }))
    },
  })
  const active = (subs.data ?? []).filter((s) => s.status === 'activa')
  const cancelled = (subs.data ?? []).filter((s) => s.status === 'cancelada')
  const monthly = active.reduce((t, s) => t + s.amount * FACTOR[s.frequency], 0)
  const upcoming = active.filter((s) => daysUntil(s.next_charge_date) <= 30)

  const reset = () => { setShowForm(false); setEditingId(null); setError(''); setForm({ name: '', categoryId: '', amount: '', frequency: 'mensual', start: today(), next: today(), accountId: '' }) }
  const refresh = () => qc.invalidateQueries()

  const save = useMutation({
    mutationFn: async () => {
      const n = parseAmount(form.amount)
      if (!form.name.trim()) throw new Error('Indica el nombre del servicio.')
      if (!n || isNaN(n) || n <= 0) throw new Error('Introduce un importe mayor que cero.')
      const accountId = form.accountId || accounts[0]?.id
      if (!accountId) throw new Error('Crea primero una cuenta.')
      const row = {
        name: form.name.trim(), category_id: form.categoryId || defCat || null, amount: n, frequency: form.frequency,
        start_date: form.start, next_charge_date: form.next, account_id: accountId,
      }
      const r = editingId ? await supabase.from('subscriptions').update(row).eq('id', editingId) : await supabase.from('subscriptions').insert(row)
      if (r.error) throw r.error
    },
    onSuccess: () => { reset(); refresh() },
    onError: (e: Error) => setError(e.message),
  })

  const charge = useMutation({
    mutationFn: async (s: Sub) => {
      if (!confirm(`Se registrará un gasto de ${money(s.amount)} (${s.name}) con fecha ${fmtDate(s.next_charge_date)} y la próxima renovación avanzará un periodo. ¿Confirmar?`)) return
      const { error } = await supabase.rpc('confirm_subscription_charge', { p_sub: s.id })
      if (error) throw error
      setInfo(`Cobro de ${s.name} registrado.`)
    },
    onSuccess: refresh,
    onError: (e: Error) => setInfo(`No se pudo registrar el cobro: ${e.message}`),
  })

  const setStatus = useMutation({
    mutationFn: async (s: Sub) => { await supabase.from('subscriptions').update({ status: s.status === 'activa' ? 'cancelada' : 'activa' }).eq('id', s.id) },
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: async (s: Sub) => {
      if (!confirm(`¿Eliminar "${s.name}"?`)) return
      const { error } = await supabase.from('subscriptions').delete().eq('id', s.id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: () => setInfo('No se puede eliminar porque ya tiene cobros registrados. Márcala como cancelada para conservar el historial.'),
  })

  function startEdit(s: Sub) {
    setEditingId(s.id)
    setForm({ name: s.name, categoryId: s.category_id ?? '', amount: String(s.amount).replace('.', ','), frequency: s.frequency, start: s.start_date, next: s.next_charge_date, accountId: s.account_id ?? '' })
    setError('')
    setShowForm(true); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)
  }

  const Row = ({ s }: { s: Sub }) => {
    const due = s.status === 'activa' && daysUntil(s.next_charge_date) <= 0
    return (
      <li className={`card ${s.status === 'cancelada' ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-white truncate">{s.name}</div>
            <div className="text-xs text-mute truncate">{catName(s.category_id)} · {accName(s.account_id)} · {FREQ[s.frequency]}</div>
            {s.status === 'activa' && <div className={`text-xs mt-0.5 ${due ? 'text-brass' : 'text-mute'}`}>Próximo cobro: {fmtDate(s.next_charge_date)} ({when(s.next_charge_date)})</div>}
          </div>
          <div className="text-right">
            <div className="text-white font-semibold">{money(s.amount)}</div>
            <div className="text-xs text-mute">{money(s.amount * FACTOR[s.frequency])}/mes</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {s.status === 'activa' && <button className={due ? 'btn text-sm' : 'btn-ghost text-sm'} onClick={() => charge.mutate(s)}>Confirmar cobro</button>}
          <button className="btn-ghost text-sm" onClick={() => startEdit(s)}>Editar</button>
          <button className="btn-ghost text-sm" onClick={() => setStatus.mutate(s)}>{s.status === 'activa' ? 'Cancelar' : 'Reactivar'}</button>
          <button className="btn-ghost text-sm text-neg" onClick={() => remove.mutate(s)}>Eliminar</button>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><h1 className="text-white text-2xl font-bold">Suscripciones</h1><AddButton label="Añadir suscripción" onClick={() => { reset(); setShowForm(true); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50) }} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card"><div className="text-mute text-sm">Gasto mensual equivalente</div><div className="text-white text-xl font-bold">{money(monthly)}</div></div>
        <div className="card"><div className="text-mute text-sm">Gasto anual estimado</div><div className="text-white text-xl font-bold">{money(monthly * 12)}</div></div>
      </div>
      {info && <p className="text-sm text-brass" role="status">{info}</p>}

      {upcoming.length > 0 && (
        <div className="card">
          <h2 className="text-white font-semibold mb-2">Próximas renovaciones (30 días)</h2>
          <ul className="text-sm space-y-1">
            {upcoming.map((s) => (
              <li key={s.id} className="flex justify-between"><span>{s.name} · {fmtDate(s.next_charge_date)} ({when(s.next_charge_date)})</span><span className="text-white">{money(s.amount)}</span></li>
            ))}
          </ul>
        </div>
      )}

      {subs.isLoading && <p className="text-mute">Cargando…</p>}
      {!subs.isLoading && active.length === 0 && <p className="text-mute">No tienes suscripciones activas. Añade la primera abajo.</p>}
      <ul className="space-y-2">{active.map((s) => <Row key={s.id} s={s} />)}</ul>

      {cancelled.length > 0 && (<>
        <h2 className="text-mute text-sm">Canceladas</h2>
        <ul className="space-y-2">{cancelled.map((s) => <Row key={s.id} s={s} />)}</ul>
      </>)}

      <form className={`card space-y-3 ${showForm ? '' : 'hidden'}`} onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <h2 className="text-white font-semibold">{editingId ? 'Editar suscripción' : 'Nueva suscripción'}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="label" htmlFor="sn">Servicio</label><input id="sn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="sa">Importe (€)</label><input id="sa" className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><label className="label" htmlFor="sf">Frecuencia</label>
            <select id="sf" className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Freq })}>
              {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label" htmlFor="sc">Categoría</label>
            <select id="sc" className="input" value={form.categoryId || defCat} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="ss">Fecha de contratación</label>
            <input id="ss" type="date" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, next: editingId ? form.next : e.target.value })} /></div>
          <div><label className="label" htmlFor="sx">Próximo cobro</label>
            <input id="sx" type="date" className="input" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label" htmlFor="sk">Cuenta asociada</label>
            <select id="sk" className="input" value={form.accountId || accounts[0]?.id || ''} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.entity} · {a.name}</option>)}
            </select></div>
        </div>
        {editingId && <p className="text-xs text-mute">Si cambias el importe, solo afecta a los cobros futuros: los ya registrados no se modifican.</p>}
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button className="btn" disabled={save.isPending}>{editingId ? 'Guardar cambios' : 'Añadir suscripción'}</button>
          <button type="button" className="btn-ghost" onClick={reset}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
