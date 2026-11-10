import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useCategories } from '../lib/hooks'
import { addMonths, money, parseAmount, ymd } from '../lib/format'

interface Row { id: string; month: string; category_id: string | null; budget: number; spent: number; alert_thresholds: number[] }

const barColor = (pct: number, th: number[]) => {
  const [a = 75, b = 90, c = 100] = th
  return pct >= c ? 'bg-neg' : pct >= b ? 'bg-[#F0A36B]' : pct >= a ? 'bg-brass' : 'bg-pos'
}

export default function Budgets() {
  const qc = useQueryClient()
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7))
  const monthDate = `${month}-01`
  const prevDate = ymd(addMonths(new Date(monthDate + 'T00:00:00'), -1))
  const categories = useCategories().data ?? []
  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? 'Categoría' : 'Presupuesto general')

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('alert_thresholds').maybeSingle()
      return ((data?.alert_thresholds as number[] | undefined) ?? [75, 90, 100])
    },
  })
  const defTh = (settings.data ?? [75, 90, 100]).map(String)

  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const [th, setTh] = useState<string[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const thValues = th ?? defTh

  const rows = useQuery({
    queryKey: ['budgets', monthDate],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from('budget_progress').select('*').eq('month', monthDate)
      if (error) throw error
      return (data as any[]).map((r) => ({ ...r, budget: Number(r.budget), spent: Number(r.spent) }))
    },
  })

  const reset = () => { setCatId(''); setAmount(''); setTh(null); setEditingId(null); setError('') }

  const save = useMutation({
    mutationFn: async () => {
      const n = parseAmount(amount)
      if (!n || isNaN(n) || n <= 0) throw new Error('Introduce un importe mayor que cero.')
      const t = thValues.map((x) => Math.round(Number(x)))
      if (t.length !== 3 || t.some((x) => isNaN(x) || x <= 0)) throw new Error('Los tres porcentajes de alerta deben ser números mayores que cero.')
      t.sort((a, b) => a - b)
      const row = { month: monthDate, category_id: catId || null, amount: n, alert_thresholds: t }
      const existing = (rows.data ?? []).find((r) => (r.category_id ?? '') === catId)
      const id = editingId ?? existing?.id
      const r = id ? await supabase.from('budgets').update(row).eq('id', id) : await supabase.from('budgets').insert(row)
      if (r.error) throw r.error
    },
    onSuccess: () => { reset(); qc.invalidateQueries() },
    onError: (e: Error) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from('budgets').delete().eq('id', id) },
    onSuccess: () => qc.invalidateQueries(),
  })

  const copyPrev = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('budgets').select('*').eq('month', prevDate)
      if (error) throw error
      const have = new Set((rows.data ?? []).map((r) => r.category_id ?? ''))
      const toAdd = (data as any[]).filter((b) => !have.has(b.category_id ?? ''))
        .map((b) => ({ month: monthDate, category_id: b.category_id, amount: b.amount, alert_thresholds: b.alert_thresholds }))
      if (toAdd.length === 0) { setInfo('No hay presupuestos nuevos que copiar del mes anterior.'); return }
      const r = await supabase.from('budgets').insert(toAdd)
      if (r.error) throw r.error
      setInfo(`Copiados ${toAdd.length} presupuestos del mes anterior.`)
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => setInfo(e.message),
  })

  function startEdit(r: Row) {
    setEditingId(r.id); setCatId(r.category_id ?? ''); setAmount(String(r.budget).replace('.', ','))
    setTh(r.alert_thresholds.map(String)); setError('')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const list = [...(rows.data ?? [])].sort((a, b) => (a.category_id === null ? -1 : b.category_id === null ? 1 : b.spent / b.budget - a.spent / a.budget))
  const expenseCats = categories.filter((c) => c.kind === 'gasto' && c.active)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Presupuestos</h1>
        <div className="flex gap-2">
          <input type="month" className="input w-auto" value={month} onChange={(e) => { setMonth(e.target.value); setInfo('') }} aria-label="Mes" />
          <button className="btn-ghost" onClick={() => copyPrev.mutate()}>Copiar del mes anterior</button>
        </div>
      </div>
      {info && <p className="text-sm text-brass" role="status">{info}</p>}

      {rows.isLoading && <p className="text-mute">Cargando…</p>}
      {!rows.isLoading && list.length === 0 && <p className="text-mute">No hay presupuestos para este mes. Crea uno abajo o copia los del mes anterior.</p>}

      <ul className="space-y-3">
        {list.map((r) => {
          const pct = (r.spent / r.budget) * 100
          const reached = r.alert_thresholds.filter((t) => pct >= t).pop()
          const left = r.budget - r.spent
          return (
            <li key={r.id} className="card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-white font-semibold truncate">{catName(r.category_id)}</div>
                <div className="text-sm text-mute whitespace-nowrap">{money(r.spent)} de {money(r.budget)}</div>
              </div>
              <div className="h-2.5 rounded-full bg-raise overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <div className={`h-full ${barColor(pct, r.alert_thresholds)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-soft">{pct.toFixed(0)} % consumido · {left >= 0 ? `quedan ${money(left)}` : `te has pasado ${money(-left)}`}</span>
                <span className="flex gap-2">
                  <button className="btn-ghost text-sm" onClick={() => startEdit(r)}>Editar</button>
                  <button className="btn-ghost text-sm text-neg" onClick={() => confirm('¿Eliminar este presupuesto?') && remove.mutate(r.id)}>Eliminar</button>
                </span>
              </div>
              {reached !== undefined && <p className={`text-sm ${pct >= 100 ? 'text-neg' : 'text-brass'}`}>
                {pct >= 100 ? 'Has superado el presupuesto.' : `Has superado el umbral del ${reached} %.`}</p>}
            </li>
          )
        })}
      </ul>

      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <h2 className="text-white font-semibold">{editingId ? 'Editar presupuesto' : 'Nuevo presupuesto'} · {month}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="label" htmlFor="bc">Categoría</label>
            <select id="bc" className="input" value={catId} onChange={(e) => setCatId(e.target.value)} disabled={!!editingId}>
              <option value="">Presupuesto general (todos los gastos)</option>
              {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="ba">Importe mensual (€)</label>
            <input id="ba" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </div>
        <div>
          <span className="label">Alertas al consumir (%)</span>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <input key={i} className="input" inputMode="numeric" aria-label={`Alerta ${i + 1}`} value={thValues[i]}
                onChange={(e) => { const c = [...thValues]; c[i] = e.target.value; setTh(c) }} />
            ))}
          </div>
        </div>
        <p className="text-xs text-mute">Si ya existe un presupuesto para esa categoría este mes, se actualiza.</p>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button className="btn" disabled={save.isPending}>{editingId ? 'Guardar cambios' : 'Guardar presupuesto'}</button>
          {editingId && <button type="button" className="btn-ghost" onClick={reset}>Cancelar</button>}
        </div>
      </form>
    </div>
  )
}
