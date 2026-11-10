import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { fmtMonth, money, parseAmount } from '../lib/format'
import { pctFmt, qtyFmt, type Asset } from '../lib/investments'
import type { Book, PricePoint } from '../lib/finance'

const longDate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
const TIP = { contentStyle: { background: '#1E2638', border: '1px solid #2A3450', borderRadius: 8 }, labelStyle: { color: '#C3C9D9' } }

export default function PriceHistory({ assets, prices, book }: { assets: Asset[]; prices: PricePoint[]; book: Book }) {
  const qc = useQueryClient()
  const [assetId, setAssetId] = useState('')
  const [mode, setMode] = useState<'dia' | 'mes'>('mes')
  const id = assetId || assets[0]?.id || ''

  const rows = useMemo(() => {
    let pts = prices.filter((p) => p.asset_id === id).sort((a, b) => (a.date < b.date ? -1 : 1))
    if (mode === 'mes') {
      const m = new Map<string, PricePoint>()
      for (const p of pts) m.set(p.date.slice(0, 7), p)   // se queda con el último precio de cada mes
      pts = [...m.values()]
    }
    return pts.map((p, i) => ({ ...p, change: i > 0 && pts[i - 1].price > 0 ? p.price / pts[i - 1].price - 1 : null, qty: book.qty(id, p.date) }))
  }, [prices, id, mode, book])

  const refresh = () => qc.invalidateQueries()
  const edit = useMutation({
    mutationFn: async (r: { date: string; price: number }) => {
      const v = prompt('Nuevo precio por participación (€):', String(r.price).replace('.', ','))
      if (v === null) return
      const n = parseAmount(v)
      if (isNaN(n) || n <= 0) throw new Error('Precio no válido')
      const { error } = await supabase.from('asset_prices').update({ price: Math.round(n * 1e6) / 1e6 }).eq('asset_id', id).eq('date', r.date)
      if (error) throw error
    },
    onSuccess: refresh,
  })
  const del = useMutation({
    mutationFn: async (date: string) => {
      if (!confirm('¿Eliminar este valor del histórico?')) return
      await supabase.from('asset_prices').delete().eq('asset_id', id).eq('date', date)
    },
    onSuccess: refresh,
  })

  if (assets.length === 0) return <p className="text-mute">Crea primero un activo para ver su histórico.</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={id} onChange={(e) => setAssetId(e.target.value)} aria-label="Activo">
          {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-1 bg-panel border border-line p-1 rounded-lg" role="tablist">
          {(['dia', 'mes'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`rounded-md text-sm ${mode === m ? 'bg-raise text-white font-semibold' : 'text-mute'}`}>{m === 'dia' ? 'Día' : 'Mes'}</button>
          ))}
        </div>
      </div>

      {rows.length >= 2 && (
        <div className="card">
          <ResponsiveContainer width="100%" height={200}><LineChart data={rows.map((r) => ({ d: mode === 'mes' ? fmtMonth(r.date) : longDate(r.date), Precio: r.price }))}>
            <CartesianGrid stroke="#2A3450" vertical={false} /><XAxis dataKey="d" stroke="#8A93AA" fontSize={12} /><YAxis stroke="#8A93AA" fontSize={12} width={60} domain={['auto', 'auto']} />
            <Tooltip {...TIP} formatter={(v: number) => money(v)} /><Line dataKey="Precio" stroke="#E0B25A" strokeWidth={2} dot={rows.length < 30} />
          </LineChart></ResponsiveContainer>
        </div>
      )}

      {mode === 'mes' && <p className="text-xs text-mute">Se muestra el último valor registrado de cada mes. Cambia a «Día» para ver todos los valores intermedios (por ejemplo, los precios de tus compras).</p>}
      {rows.length === 0 && <p className="text-mute">Aún no hay valores registrados para este activo.</p>}

      <ul className="space-y-2">
        {[...rows].reverse().map((r) => (
          <li key={r.date} className="card">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-white">{mode === 'mes' ? fmtMonth(r.date) : longDate(r.date)}</div>
                <div className="text-xs text-mute">{r.qty > 1e-9 ? `${qtyFmt(r.qty)} participaciones · posición ${money(r.qty * r.price)}` : 'Sin posición'}</div>
              </div>
              <div className="text-right">
                <div className="text-white font-semibold">{money(r.price)}</div>
                <div className={`text-xs ${r.change === null ? 'text-mute' : r.change >= 0 ? 'text-pos' : 'text-neg'}`}>
                  {r.change === null ? '—' : `${r.change >= 0 ? '+' : ''}${pctFmt(r.change)}`}</div>
              </div>
            </div>
            {(
              <div className="flex gap-2 mt-3">
                <button className="btn-ghost text-sm" onClick={() => edit.mutate(r)}>Editar</button>
                <button className="btn-ghost text-sm text-neg" onClick={() => del.mutate(r.date)}>Eliminar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
