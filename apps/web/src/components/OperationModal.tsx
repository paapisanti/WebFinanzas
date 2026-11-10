import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts } from '../lib/hooks'
import { money, parseAmount, today } from '../lib/format'
import type { Asset, OpRow } from '../lib/investments'

export default function OperationModal({ assets, ops, op, onClose }: { assets: Asset[]; ops: OpRow[]; op?: OpRow; onClose: () => void }) {
  const qc = useQueryClient()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const defAccount = accounts.find((a) => a.type === 'inversion')?.id ?? accounts[0]?.id ?? ''
  const [type, setType] = useState<'compra' | 'venta'>(op?.type ?? 'compra')
  const [assetId, setAssetId] = useState(op?.asset_id ?? assets[0]?.id ?? '')
  const [date, setDate] = useState(op?.date ?? today())
  const [qty, setQty] = useState(op ? String(op.quantity).replace('.', ',') : '')
  const [price, setPrice] = useState(op ? String(op.unit_price).replace('.', ',') : '')
  const [fees, setFees] = useState(op ? String(op.fees).replace('.', ',') : '0')
  const [accountId, setAccountId] = useState(op?.account_id ?? '')
  const [notes, setNotes] = useState(op?.notes ?? '')
  const [error, setError] = useState('')

  const q = parseAmount(qty), p = parseAmount(price), f = parseAmount(fees || '0')
  const total = (isNaN(q) || isNaN(p) ? 0 : q * p) + (type === 'compra' ? 1 : -1) * (isNaN(f) ? 0 : f)
  const effAccount = accountId || defAccount

  const save = useMutation({
    mutationFn: async () => {
      if (!assetId) throw new Error('Crea primero un activo en la pestaña Activos.')
      if (!q || isNaN(q) || q <= 0) throw new Error('La cantidad debe ser mayor que cero.')
      if (isNaN(p) || p < 0) throw new Error('El precio unitario no es válido.')
      if (isNaN(f) || f < 0) throw new Error('Las comisiones no son válidas.')
      if (!effAccount) throw new Error('Crea primero una cuenta (idealmente de tipo inversión).')
      if (type === 'venta') {
        const held = ops.filter((o) => o.asset_id === assetId && o.date <= date && o.id !== op?.id)
          .reduce((s, o) => s + (o.type === 'compra' ? o.quantity : -o.quantity), 0)
        if (q > held + 1e-9) throw new Error(`Solo tenías ${held} participaciones a esa fecha.`)
      }
      const row = { asset_id: assetId, type, date, quantity: q, unit_price: p, fees: f, account_id: effAccount, notes: notes.trim() || null }
      const r = op ? await supabase.from('investment_operations').update(row).eq('id', op.id) : await supabase.from('investment_operations').insert(row)
      if (r.error) throw r.error
      // Deja anotado el precio de ese día (sin pisar uno ya existente) para que la cartera se valore bien
      await supabase.from('asset_prices').upsert({ asset_id: assetId, date, price: p }, { onConflict: 'asset_id,date', ignoreDuplicates: true })
    },
    onSuccess: () => { qc.invalidateQueries(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        className="bg-panel border border-line w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">{op ? 'Editar operación' : 'Nueva operación'}</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-raise p-1 rounded-lg" role="tablist">
          {(['compra', 'venta'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => setType(t)}
              className={`py-2 rounded-md text-sm capitalize ${type === t ? 'bg-brass text-ink font-semibold' : 'text-mute'}`}>{t}</button>
          ))}
        </div>
        <div><label className="label" htmlFor="oa">Activo</label>
          <select id="oa" className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="oq">Participaciones</label><input id="oq" className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></div>
          <div><label className="label" htmlFor="op">Precio unitario (€)</label><input id="op" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><label className="label" htmlFor="of">Comisiones (€)</label><input id="of" className="input" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} /></div>
          <div><label className="label" htmlFor="od">Fecha</label><input id="od" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="text-sm text-soft">Total de la operación: <span className="text-white font-semibold">{money(total)}</span></div>
        <div><label className="label" htmlFor="ok">Cuenta de inversión</label>
          <select id="ok" className="input" value={effAccount} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.entity} · {a.name}</option>)}
          </select>
          <p className="text-xs text-mute mt-1">La operación mueve el efectivo de esta cuenta. Si es una compra, antes tiene que haber saldo: haz una transferencia desde tu cuenta bancaria.</p></div>
        <div><label className="label" htmlFor="on">Observaciones (opcional)</label><input id="on" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={save.isPending}>Guardar</button>
      </form>
    </div>
  )
}
