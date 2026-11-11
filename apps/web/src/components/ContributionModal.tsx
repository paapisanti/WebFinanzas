import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts } from '../lib/hooks'
import { fmtDate, money, parseAmount, today } from '../lib/format'
import type { Asset, Contribution, ValueRow } from '../lib/investments'

const r2 = (n: number) => Math.round(n * 100) / 100

export default function ContributionModal({ assets, values, contrib, onClose }: { assets: Asset[]; values: ValueRow[]; contrib?: Contribution; onClose: () => void }) {
  const qc = useQueryClient()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const [kind, setKind] = useState<'aportacion' | 'retirada'>(contrib && contrib.amount < 0 ? 'retirada' : 'aportacion')
  const [assetId, setAssetId] = useState(contrib?.asset_id ?? assets[0]?.id ?? '')
  const [amount, setAmount] = useState(contrib ? String(Math.abs(contrib.amount)).replace('.', ',') : '')
  const [date, setDate] = useState(contrib?.date ?? today())
  const [accountId, setAccountId] = useState(contrib ? contrib.account_id ?? '' : accounts.find((a) => a.type === 'inversion')?.id ?? '')
  const [adjust, setAdjust] = useState(true)
  const [error, setError] = useState('')

  const n = parseAmount(amount)
  const signed = (isNaN(n) ? 0 : r2(n)) * (kind === 'retirada' ? -1 : 1)
  // Valores ya registrados con fecha igual o posterior: por la fecha elegida, la app los entiende como "ya incluían" este dinero
  const affected = contrib ? [] : values.filter((v) => v.asset_id === assetId && v.date >= date).sort((a, b) => (a.date < b.date ? -1 : 1))
  const lastAff = affected[affected.length - 1]

  const save = useMutation({
    mutationFn: async () => {
      if (!assetId) throw new Error('Crea primero un activo.')
      if (!n || isNaN(n) || n <= 0) throw new Error('Introduce un importe mayor que cero.')
      const row = { asset_id: assetId, date, amount: signed, account_id: accountId || null }
      if (contrib) {
        const r = await supabase.from('investment_contributions').update(row).eq('id', contrib.id)
        if (r.error) throw r.error
        return
      }
      const targets = adjust ? affected : []
      if (targets.some((v) => v.value + signed < -0.005)) throw new Error('Con esta retirada, uno de los valores registrados quedaría en negativo. Revisa el importe o la fecha.')
      const r = await supabase.from('investment_contributions').insert(row)
      if (r.error) throw r.error
      for (const v of targets) {
        const u = await supabase.from('investment_values').update({ value: r2(v.value + signed) }).eq('id', v.id)
        if (u.error) throw new Error(`La aportación se guardó, pero no se pudo actualizar el valor del ${fmtDate(v.date)}. Edítalo en «Ver y corregir historial».`)
      }
    },
    onSuccess: () => { qc.invalidateQueries(); onClose() },
    onError: (e: Error) => { setError(e.message); qc.invalidateQueries() },
  })

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        className="bg-panel border border-line w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">{contrib ? 'Editar' : 'Nueva'} {kind === 'aportacion' ? 'aportación' : 'retirada'}</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-raise p-1 rounded-lg" role="tablist">
          {([['aportacion', 'Aportación'], ['retirada', 'Retirada']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={`py-2 rounded-md text-sm ${kind === k ? 'bg-brass text-ink font-semibold' : 'text-mute'}`}>{l}</button>
          ))}
        </div>
        <div><label className="label" htmlFor="ca">Activo</label>
          <select id="ca" className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="cm">{kind === 'aportacion' ? 'Dinero que metes (€)' : 'Dinero que sacas (€)'}</label>
            <input id="cm" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><label className="label" htmlFor="cd">Fecha</label>
            <input id="cd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>

        {lastAff && (
          <div className="rounded-lg border border-brass p-3 space-y-2 text-sm">
            <p className="text-soft">Ya tienes registrado el valor del <b className="text-white">{fmtDate(lastAff.date)}</b> ({money(lastAff.value)}). Con esta fecha, la app entiende que ese valor ya incluía este dinero.</p>
            <label className="flex items-start gap-2 text-soft">
              <input type="checkbox" className="mt-1" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
              <span>No lo incluía: sumarlo a {affected.length === 1 ? 'ese valor' : `los ${affected.length} valores registrados desde esa fecha`}.</span>
            </label>
            <p className="text-xs text-mute">{adjust
              ? `El valor del ${fmtDate(lastAff.date)} pasará de ${money(lastAff.value)} a ${money(lastAff.value + signed)}.`
              : 'Tu dinero total no cambiará: marca la casilla si este dinero se suma a lo que ya tenías.'}</p>
          </div>
        )}

        <div><label className="label" htmlFor="cc">{kind === 'aportacion' ? 'Sale de la cuenta' : 'Vuelve a la cuenta'}</label>
          <select id="cc" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Ninguna (no tocar mis cuentas)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.entity} · {a.name}</option>)}
          </select>
          <p className="text-xs text-mute mt-1">Si eliges una cuenta, su saldo se ajusta solo y tu patrimonio no cambia.</p></div>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={save.isPending}>Guardar</button>
      </form>
    </div>
  )
}
