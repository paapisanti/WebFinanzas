import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtMonth, money, ymd } from '../lib/format'
import { ASSET_LABEL, isinOk, pctFmt, qtyFmt, useInvestments, type Asset, type AssetType, type OpRow } from '../lib/investments'
import { useAccounts } from '../lib/hooks'
import OperationModal from '../components/OperationModal'
import PricesModal from '../components/PricesModal'
import PriceHistory from '../components/PriceHistory'

const COLORS = ['#E0B25A', '#7FB2F0', '#6FCF9F', '#B79CED']
const TIP = { contentStyle: { background: '#1E2638', border: '1px solid #2A3450', borderRadius: 8 }, labelStyle: { color: '#C3C9D9' } }
const tone = (n: number | null) => (n === null ? 'text-white' : n >= 0 ? 'text-pos' : 'text-neg')

function Kpi({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return <div className="card"><div className="text-mute text-sm">{label}</div><div className={`text-xl font-bold ${cls ?? 'text-white'}`}>{value}</div>{sub && <div className="text-xs text-mute mt-0.5">{sub}</div>}</div>
}

export default function Investments() {
  const qc = useQueryClient()
  const inv = useInvestments()
  const accounts = useAccounts().data ?? []
  const [tab, setTab] = useState<'cartera' | 'operaciones' | 'activos' | 'historico'>('cartera')
  const [opModal, setOpModal] = useState<{ op?: OpRow } | null>(null)
  const [pricesOpen, setPricesOpen] = useState(false)
  const p = inv.portfolio
  const now = new Date()
  const lastPrev = ymd(new Date(now.getFullYear(), now.getMonth(), 0))   // último día del mes anterior
  const prevMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('es-ES', { month: 'long' })
  const pending = inv.open.some((x) => !x.priceDate || x.priceDate < lastPrev)
  const assetName = (id: string) => inv.assets.find((a) => a.id === id)?.name ?? ''
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Cuenta eliminada'

  const delOp = useMutation({
    mutationFn: async (o: OpRow) => { await supabase.from('investment_operations').update({ deleted_at: new Date().toISOString() }).eq('id', o.id) },
    onSuccess: () => qc.invalidateQueries(),
  })

  // --- Activos ---
  const [editing, setEditing] = useState<Asset | null>(null)
  const [aName, setAName] = useState('')
  const [aIsin, setAIsin] = useState('')
  const [aType, setAType] = useState<AssetType>('etf')
  const [aErr, setAErr] = useState('')
  const resetAsset = () => { setEditing(null); setAName(''); setAIsin(''); setAType('etf'); setAErr('') }
  const saveAsset = useMutation({
    mutationFn: async () => {
      const isin = aIsin.trim().toUpperCase()
      if (!aName.trim()) throw new Error('Indica el nombre del activo.')
      if (isin && !isinOk(isin)) throw new Error('El ISIN no es válido: son 12 caracteres, por ejemplo IE00B4L5Y983.')
      const row = { name: aName.trim(), isin: isin || null, type: aType }
      const r = editing ? await supabase.from('assets').update(row).eq('id', editing.id) : await supabase.from('assets').insert(row)
      if (r.error) throw r.error
    },
    onSuccess: () => { resetAsset(); qc.invalidateQueries() },
    onError: (e: Error) => setAErr(e.message),
  })
  const delAsset = useMutation({
    mutationFn: async (a: Asset) => {
      if (inv.allOps.some((o) => o.asset_id === a.id)) throw new Error(`"${a.name}" tiene operaciones. Elimínalas antes de borrar el activo.`)
      if (!confirm(`¿Eliminar "${a.name}"?`)) return
      const r = await supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', a.id)
      if (r.error) throw r.error
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => setAErr(e.message),
  })

  const TABS = [['cartera', 'Cartera'], ['operaciones', 'Operaciones'], ['activos', 'Activos'], ['historico', 'Histórico']] as const
  const sortedOps = [...inv.allOps].filter((o) => inv.assets.some((a) => a.id === o.asset_id)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Inversiones</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setPricesOpen(true)}>Actualizar mes</button>
          <button className="btn" onClick={() => inv.assets.length ? setOpModal({}) : setTab('activos')}>+ Operación</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 bg-panel border border-line p-1 rounded-lg" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`py-2 rounded-md text-xs md:text-sm ${tab === k ? 'bg-raise text-white font-semibold' : 'text-mute'}`}>{l}</button>
        ))}
      </div>

      {inv.isLoading && <p className="text-mute">Cargando…</p>}
      {inv.error && <p className="text-neg text-sm" role="alert">No se pudieron cargar las inversiones.</p>}

      {tab === 'cartera' && !inv.isLoading && (<>
        {pending && (
          <div className="card flex flex-wrap items-center justify-between gap-3 border-brass">
            <p className="text-sm text-soft">Falta la actualización de <b className="text-white">{prevMonthName}</b>: apunta cuánto ha subido o bajado cada activo.</p>
            <button className="btn" onClick={() => setPricesOpen(true)}>Actualizar ahora</button>
          </div>
        )}
        {!p.hasOps ? (
          <div className="card text-sm text-mute space-y-2">
            <p className="text-white font-semibold">Aún no tienes inversiones registradas.</p>
            <p>1) Crea el activo en la pestaña <b>Activos</b>. 2) Transfiere dinero a tu cuenta de inversión desde Movimientos. 3) Registra la compra con <b>+ Operación</b>.</p>
          </div>
        ) : (<>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi label="Valor de mercado" value={money(p.value)} />
            <Kpi label="Capital invertido (coste)" value={money(p.cost)} />
            <Kpi label="Beneficio / pérdida" value={`${p.pnl >= 0 ? '+' : '−'}${money(Math.abs(p.pnl))}`} sub={pctFmt(p.pnlPct)} cls={tone(p.pnl)} />
            <Kpi label="Rentabilidad personal (XIRR)" value={pctFmt(p.xirr)} sub={p.xirr === null ? 'Disponible tras 30 días' : 'anualizada'} cls={tone(p.xirr)} />
            <Kpi label="Rentabilidad cartera (TWR)" value={pctFmt(p.twr)} sub="acumulada" cls={tone(p.twr)} />
          </div>
          <p className="text-xs text-mute">El XIRR mide lo que has ganado tú teniendo en cuenta cuándo aportaste. El TWR mide cómo ha rendido la cartera sin el efecto de tus aportaciones. Su precisión depende de que mantengas los precios al día.</p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <h2 className="text-white font-semibold mb-2">Evolución de la cartera</h2>
              {inv.series.length < 2 ? <p className="text-mute text-sm py-10">Se necesitan al menos dos meses de histórico.</p> :
                <ResponsiveContainer width="100%" height={220}><LineChart data={inv.series.map((s) => ({ d: fmtMonth(s.date), Valor: s.value, Aportado: s.contributed }))}>
                  <CartesianGrid stroke="#2A3450" vertical={false} /><XAxis dataKey="d" stroke="#8A93AA" fontSize={12} /><YAxis stroke="#8A93AA" fontSize={12} width={60} />
                  <Tooltip {...TIP} formatter={(v: number) => money(v)} /><Legend />
                  <Line dataKey="Valor" stroke="#E0B25A" strokeWidth={2} dot={false} /><Line dataKey="Aportado" stroke="#8A93AA" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart></ResponsiveContainer>}
            </div>
            <div className="card">
              <h2 className="text-white font-semibold mb-2">Distribución por clase de activo</h2>
              <ResponsiveContainer width="100%" height={180}><PieChart>
                <Pie data={inv.byClass} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} stroke="#171D2C">
                  {inv.byClass.map((c, i) => <Cell key={c.type} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip {...TIP} formatter={(v: number) => money(v)} />
              </PieChart></ResponsiveContainer>
              <ul className="text-sm space-y-1 mt-2">{inv.byClass.map((c, i) => (
                <li key={c.type} className="flex justify-between"><span><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: COLORS[i % COLORS.length] }} />{c.name}</span>
                  <span className="text-white">{money(c.value)} · {pctFmt(c.value / p.value, 1)}</span></li>))}
              </ul>
            </div>
          </div>

          <h2 className="text-white font-semibold">Posiciones</h2>
          <ul className="space-y-2">
            {inv.open.map((x) => {
              return (
                <li key={x.asset.id} className="card space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="text-white truncate">{x.asset.name}</div>
                      <div className="text-xs text-mute">{ASSET_LABEL[x.asset.type]}{x.asset.isin && ` · ${x.asset.isin}`}</div></div>
                    <div className="text-right"><div className="text-white font-semibold">{money(x.value)}</div><div className="text-xs text-mute">{pctFmt(x.weight, 1)} de la cartera</div></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                    <div><span className="text-mute">Participaciones </span>{qtyFmt(x.qty)}</div>
                    <div><span className="text-mute">Precio </span>{money(x.price)}</div>
                    <div><span className="text-mute">Coste </span>{money(x.cost)}</div>
                    <div className={tone(x.pnl)}>{x.pnl >= 0 ? '+' : '−'}{money(Math.abs(x.pnl))} ({pctFmt(x.pnlPct)})</div>
                    <div><span className="text-mute">XIRR </span>{pctFmt(x.xirr)}</div>
                    <div><span className="text-mute">TWR </span>{pctFmt(x.twr)}</div>
                    <div className="col-span-2"><span className="text-mute">1.ª compra </span>{x.firstBuy ? fmtDate(x.firstBuy) : '—'}</div>
                  </div>
                  {x.priceDate && <p className="text-xs text-mute">Último valor: {fmtDate(x.priceDate)}</p>}
                </li>
              )
            })}
          </ul>
        </>)}
      </>)}

      {tab === 'operaciones' && (
        <ul className="space-y-2">
          {sortedOps.length === 0 && <p className="text-mute">Todavía no hay operaciones.</p>}
          {sortedOps.map((o) => (
            <li key={o.id} className="card">
              <div className="flex items-center gap-3">
                <div className="w-12 text-mute text-sm">{fmtDate(o.date)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate"><span className={o.type === 'compra' ? 'text-pos' : 'text-neg'}>{o.type === 'compra' ? 'Compra' : 'Venta'}</span> · {assetName(o.asset_id)}</div>
                  <div className="text-xs text-mute truncate">{qtyFmt(o.quantity)} × {money(o.unit_price)}{o.fees > 0 && ` + ${money(o.fees)} comisión`} · {accName(o.account_id)}</div>
                </div>
                <div className="text-white font-semibold">{money(o.quantity * o.unit_price)}</div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn-ghost text-sm" onClick={() => setOpModal({ op: o })}>Editar</button>
                <button className="btn-ghost text-sm text-neg" onClick={() => confirm('¿Eliminar esta operación?') && delOp.mutate(o)}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'activos' && (<>
        <ul className="space-y-2">
          {inv.assets.length === 0 && <p className="text-mute">Aún no has creado ningún activo.</p>}
          {inv.assets.map((a) => (
            <li key={a.id} className="card flex items-center gap-3">
              <div className="flex-1 min-w-0"><div className="text-white truncate">{a.name}</div><div className="text-xs text-mute">{ASSET_LABEL[a.type]}{a.isin && ` · ${a.isin}`}</div></div>
              <button className="btn-ghost text-sm" onClick={() => { setEditing(a); setAName(a.name); setAIsin(a.isin ?? ''); setAType(a.type); setAErr('') }}>Editar</button>
              <button className="btn-ghost text-sm text-neg" onClick={() => delAsset.mutate(a)}>Eliminar</button>
            </li>
          ))}
        </ul>
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); saveAsset.mutate() }}>
          <h2 className="text-white font-semibold">{editing ? 'Editar activo' : 'Nuevo activo'}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label" htmlFor="an">Nombre</label><input id="an" className="input" value={aName} onChange={(e) => setAName(e.target.value)} /></div>
            <div><label className="label" htmlFor="ai">ISIN (opcional)</label><input id="ai" className="input uppercase" maxLength={12} value={aIsin} onChange={(e) => setAIsin(e.target.value)} /></div>
            <div className="md:col-span-2"><label className="label" htmlFor="at">Tipo</label>
              <select id="at" className="input" value={aType} onChange={(e) => setAType(e.target.value as AssetType)}>
                {Object.entries(ASSET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <p className="text-xs text-mute">Los inmuebles no se registran aquí: irán en la sección de Patrimonio.</p>
          {aErr && <p className="text-neg text-sm" role="alert">{aErr}</p>}
          <div className="flex gap-2"><button className="btn" disabled={saveAsset.isPending}>{editing ? 'Guardar cambios' : 'Crear activo'}</button>
            {editing && <button type="button" className="btn-ghost" onClick={resetAsset}>Cancelar</button>}</div>
        </form>
      </>)}

      {tab === 'historico' && !inv.isLoading && <PriceHistory assets={inv.assets} prices={inv.allPrices} book={inv.book} />}

      {opModal && <OperationModal assets={inv.assets} ops={inv.allOps} op={opModal.op} onClose={() => setOpModal(null)} />}
      {pricesOpen && <PricesModal positions={inv.open} book={inv.book} onClose={() => setPricesOpen(false)} />}
    </div>
  )
}
