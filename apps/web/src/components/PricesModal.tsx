import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { money, parseAmount, today } from '../lib/format'
import type { Position } from '../lib/investments'

export default function PricesModal({ positions, onClose }: { positions: Position[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(today())
  const [vals, setVals] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(vals).filter(([, v]) => v.trim() !== '')
        .map(([asset_id, v]) => ({ asset_id, date, price: parseAmount(v) }))
      if (rows.length === 0) throw new Error('Introduce al menos un precio.')
      if (rows.some((r) => isNaN(r.price) || r.price <= 0)) throw new Error('Hay un precio no válido.')
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
          <h2 className="text-white font-bold text-lg">Actualizar precios</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div><label className="label" htmlFor="pd">Fecha de los precios</label>
          <input id="pd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {positions.length === 0 && <p className="text-mute text-sm">No tienes posiciones abiertas.</p>}
        {positions.map((p) => (
          <div key={p.asset.id}>
            <label className="label" htmlFor={`p-${p.asset.id}`}>{p.asset.name} <span className="text-xs">· último {money(p.price)}</span></label>
            <input id={`p-${p.asset.id}`} className="input" inputMode="decimal" placeholder="Precio por participación"
              value={vals[p.asset.id] ?? ''} onChange={(e) => setVals({ ...vals, [p.asset.id]: e.target.value })} />
          </div>
        ))}
        <p className="text-xs text-mute">Deja en blanco los que no quieras cambiar. Si ya había un precio para esa fecha, se sustituye.</p>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={save.isPending}>Guardar precios</button>
      </form>
    </div>
  )
}
