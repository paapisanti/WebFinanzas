import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { addMonths, fmtDate, money, parseAmount, today, ymd } from '../lib/format'
import type { Position, ValueRow } from '../lib/investments'

const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return ymd(new Date(y, mo, 0)) }
const monthName = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

export default function MonthUpdateModal({ positions, estimateAt, lastValueOf, onClose }: {
  positions: Position[]; estimateAt: (id: string, d: string) => number; lastValueOf: (id: string, d: string) => ValueRow | null; onClose: () => void
}) {
  const qc = useQueryClient()
  const [month, setMonth] = useState(ymd(addMonths(new Date(), -1)).slice(0, 7))
  const [vals, setVals] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const date = monthEnd(month) > today() ? today() : monthEnd(month)
  const list = positions.filter((p) => p.valor > 0.005 || p.aportado > 0)

  const save = useMutation({
    mutationFn: async () => {
      const rows: { asset_id: string; date: string; value: number }[] = []
      for (const p of list) {
        const raw = (vals[p.asset.id] ?? '').trim()
        if (raw === '') continue
        const n = parseAmount(raw)
        if (isNaN(n) || n < 0) throw new Error(`${p.asset.name}: importe no válido.`)
        rows.push({ asset_id: p.asset.id, date, value: Math.round(n * 100) / 100 })
      }
      if (rows.length === 0) throw new Error('Escribe cuánto dinero tienes en al menos un activo.')
      const { error } = await supabase.from('investment_values').upsert(rows, { onConflict: 'asset_id,date' })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        className="bg-panel border border-line w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Actualizar el mes</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div><label className="label" htmlFor="um">Mes</label>
          <input id="um" type="month" className="input" max={ymd(new Date()).slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} />
          <p className="text-xs text-mute mt-1">Escribe cuánto dinero tenías en cada activo al cerrar {monthName(month)}. Si ya aportaste en el mes siguiente, no lo cuentes aquí.</p></div>

        {list.length === 0 && <p className="text-mute text-sm">Primero añade una aportación.</p>}
        {list.map((p) => {
          const est = estimateAt(p.asset.id, date)
          const n = parseAmount((vals[p.asset.id] ?? '').trim())
          const lv = lastValueOf(p.asset.id, date)
          return (
            <div key={p.asset.id}>
              <label className="label" htmlFor={`v-${p.asset.id}`}>{p.asset.name} · dinero que tienes (€)</label>
              <input id={`v-${p.asset.id}`} className="input" inputMode="decimal" placeholder={`Ej. ${String(Math.round(est)).replace('.', ',')}`}
                value={vals[p.asset.id] ?? ''} onChange={(e) => setVals({ ...vals, [p.asset.id]: e.target.value })} />
              <p className="text-xs text-mute mt-1">Antes: {money(est)}{lv ? ` (valor del ${fmtDate(lv.date)})` : ' (lo aportado)'}</p>
              {!isNaN(n) && (vals[p.asset.id] ?? '').trim() !== '' && (
                <p className={`text-xs mt-1 ${n - est >= 0 ? 'text-pos' : 'text-neg'}`}>{n - est >= 0 ? 'Ha subido' : 'Ha bajado'} {money(Math.abs(n - est))}</p>)}
            </div>
          )
        })}
        <p className="text-xs text-mute">Si ya habías actualizado ese mes, se sustituye. Los activos que dejes en blanco no se tocan.</p>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={save.isPending}>Guardar</button>
      </form>
    </div>
  )
}
