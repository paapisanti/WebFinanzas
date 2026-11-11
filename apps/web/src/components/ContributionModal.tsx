import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts } from '../lib/hooks'
import { parseAmount, today } from '../lib/format'
import type { Asset, Contribution } from '../lib/investments'

export default function ContributionModal({ assets, contrib, onClose }: { assets: Asset[]; contrib?: Contribution; onClose: () => void }) {
  const qc = useQueryClient()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived)
  const [kind, setKind] = useState<'aportacion' | 'retirada'>(contrib && contrib.amount < 0 ? 'retirada' : 'aportacion')
  const [assetId, setAssetId] = useState(contrib?.asset_id ?? assets[0]?.id ?? '')
  const [amount, setAmount] = useState(contrib ? String(Math.abs(contrib.amount)).replace('.', ',') : '')
  const [date, setDate] = useState(contrib?.date ?? today())
  const [accountId, setAccountId] = useState(contrib ? contrib.account_id ?? '' : accounts.find((a) => a.type === 'inversion')?.id ?? '')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const n = parseAmount(amount)
      if (!assetId) throw new Error('Crea primero un activo.')
      if (!n || isNaN(n) || n <= 0) throw new Error('Introduce un importe mayor que cero.')
      const row = { asset_id: assetId, date, amount: Math.round(n * 100) / 100 * (kind === 'retirada' ? -1 : 1), account_id: accountId || null }
      const r = contrib ? await supabase.from('investment_contributions').update(row).eq('id', contrib.id) : await supabase.from('investment_contributions').insert(row)
      if (r.error) throw r.error
    },
    onSuccess: () => { qc.invalidateQueries(); onClose() },
    onError: (e: Error) => setError(e.message),
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
