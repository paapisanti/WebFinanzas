import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { addMonths, fmtDate, money, parseAmount, today, ymd } from '../lib/format'
import { pctFmt, type Position } from '../lib/investments'
import type { Book } from '../lib/finance'

const prevDay = (d: string) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - 1); return ymd(x) }
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return ymd(new Date(y, mo, 0)) }
const monthName = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Actualización mensual: un porcentaje por activo. El valor se guarda a fin del mes elegido (o hoy, si es el mes en curso). */
export default function PricesModal({ positions, book, onClose }: { positions: Position[]; book: Book; onClose: () => void }) {
  const qc = useQueryClient()
  const [month, setMonth] = useState(ymd(addMonths(new Date(), -1)).slice(0, 7))
  const [vals, setVals] = useState<Record<string, string>>({})
  const [all, setAll] = useState('')
  const [error, setError] = useState('')
  const date = monthEnd(month) > today() ? today() : monthEnd(month)
  const beforeMonthEnd = monthEnd(ymd(addMonths(new Date(month + '-01T00:00:00'), -1)).slice(0, 7))

  function calc(p: Position, raw: string) {
    const prev = book.priceInfo(p.asset.id, prevDay(date))
    const q = book.qty(p.asset.id, date)
    if (q <= 1e-9) return { price: null as number | null, prev, q, skip: true, err: '' }
    if (raw.trim() === '') return { price: null as number | null, prev, q, skip: false, err: '' }
    const n = parseAmount(raw.replace('%', '').replace('+', ''))
    if (isNaN(n)) return { price: null as number | null, prev, q, skip: false, err: 'Número no válido' }
    if (prev.price <= 0) return { price: null as number | null, prev, q, skip: false, err: 'No hay un valor anterior' }
    const np = prev.price * (1 + n / 100)
    return np > 0 ? { price: np, prev, q, skip: false, err: '' } : { price: null as number | null, prev, q, skip: false, err: 'Variación no válida' }
  }

  const save = useMutation({
    mutationFn: async () => {
      const rows: { asset_id: string; date: string; price: number }[] = []
      for (const p of positions) {
        const c = calc(p, vals[p.asset.id] ?? '')
        if (c.err) throw new Error(`${p.asset.name}: ${c.err}.`)
        if (c.price !== null) rows.push({ asset_id: p.asset.id, date, price: r6(c.price) })
      }
      if (rows.length === 0) throw new Error('Escribe la variación de al menos un activo.')
      const { error } = await supabase.from('asset_prices').upsert(rows, { onConflict: 'asset_id,date' })
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
          <h2 className="text-white font-bold text-lg">Actualización mensual</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div><label className="label" htmlFor="pm">Mes que estás actualizando</label>
          <input id="pm" type="month" className="input" max={ymd(new Date()).slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} />
          <p className="text-xs text-mute mt-1">Escribe cuánto ha subido o bajado cada activo en {monthName(month)}. Usa el signo menos para las bajadas (por ejemplo −1,3).</p></div>

        {positions.length > 1 && (
          <div><label className="label" htmlFor="pa">Misma variación para todos (opcional, %)</label>
            <input id="pa" className="input" inputMode="decimal" placeholder="Ej. 1,25" value={all}
              onChange={(e) => { setAll(e.target.value); setVals(Object.fromEntries(positions.map((p) => [p.asset.id, e.target.value]))) }} /></div>
        )}

        {positions.length === 0 && <p className="text-mute text-sm">No tienes posiciones abiertas.</p>}
        {positions.map((p) => {
          const c = calc(p, vals[p.asset.id] ?? '')
          return (
            <div key={p.asset.id}>
              <label className="label" htmlFor={`p-${p.asset.id}`}>{p.asset.name} (%)</label>
              {c.skip ? <p className="text-xs text-mute">Aún no tenías este activo en ese mes.</p> : (<>
                <input id={`p-${p.asset.id}`} className="input" inputMode="decimal" placeholder="Variación del mes, ej. 1,25"
                  value={vals[p.asset.id] ?? ''} onChange={(e) => setVals({ ...vals, [p.asset.id]: e.target.value })} />
                <p className="text-xs text-mute mt-1">Valor anterior: {c.prev.price > 0 ? `${money(c.prev.price)}${c.prev.date ? ` (${fmtDate(c.prev.date)})` : ''}` : '—'}</p>
                {c.prev.date && c.prev.date < beforeMonthEnd && <p className="text-xs text-brass">Ojo: el último valor es de antes del mes anterior; el porcentaje se aplicará desde esa fecha.</p>}
                {c.err && <p className="text-xs text-neg mt-1">{c.err}</p>}
                {c.price !== null && <p className="text-xs text-soft mt-1">Pasa a valer {money(c.price * c.q)} ({money(c.price)} por participación)</p>}
              </>)}
            </div>
          )
        })}
        <p className="text-xs text-mute">Si compraste durante ese mes, pon la variación desde tu compra. Si ya habías actualizado ese mes, se sustituye.</p>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={save.isPending}>Guardar actualización</button>
      </form>
    </div>
  )
}
