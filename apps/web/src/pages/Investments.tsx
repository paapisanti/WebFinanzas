import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtMonth, money, parseAmount } from '../lib/format'
import { pctFmt, useInvestments, type Contribution, type ValueRow } from '../lib/investments'
import { useAccounts } from '../lib/hooks'
import ContributionModal from '../components/ContributionModal'
import MonthUpdateModal from '../components/MonthUpdateModal'
import AddButton from '../components/AddButton'

const COLORS = ['#E0B25A', '#7FB2F0', '#6FCF9F', '#B79CED', '#EF8A7C', '#5EC8D4', '#D98BB5', '#A3C76B']
const TIP = { contentStyle: { background: '#1E2638', border: '1px solid #2A3450', borderRadius: 8 }, labelStyle: { color: '#C3C9D9' } }
const tone = (n: number | null) => (n === null || n === 0 ? 'text-white' : n > 0 ? 'text-pos' : 'text-neg')
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`
const sPct = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${pctFmt(n)}`)

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as { Aportado: number; Valor: number; Ganado: number }
  return (
    <div style={{ background: '#1E2638', border: '1px solid #2A3450', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ color: '#C3C9D9', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#8A93AA' }}>Aportado: {money(d.Aportado)}</div>
      <div style={{ color: d.Ganado >= 0 ? '#6FCF9F' : '#EF8A7C' }}>Valor: {money(d.Valor)}</div>
      <div style={{ color: d.Ganado >= 0 ? '#6FCF9F' : '#EF8A7C' }}>Ganado: {d.Ganado >= 0 ? '+' : '−'}{money(Math.abs(d.Ganado))}</div>
    </div>
  )
}

function Kpi({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return <div className="card"><div className="text-mute text-sm">{label}</div><div className={`text-xl font-bold ${cls ?? 'text-white'}`}>{value}</div>{sub && <div className={`text-xs mt-0.5 ${cls ?? 'text-mute'}`}>{sub}</div>}</div>
}

export default function Investments() {
  const qc = useQueryClient()
  const inv = useInvestments()
  const accounts = useAccounts().data ?? []
  const [contribModal, setContribModal] = useState<{ c?: Contribution } | null>(null)
  const [monthOpen, setMonthOpen] = useState(false)
  const [aName, setAName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [aErr, setAErr] = useState('')
  const [showAssetForm, setShowAssetForm] = useState(false)
  const closeAssetForm = () => { setShowAssetForm(false); setEditingId(null); setAName(''); setAErr('') }
  const refresh = () => qc.invalidateQueries()
  const p = inv.portfolio
  const prevMonthName = new Date(inv.lastPrev + 'T00:00:00').toLocaleDateString('es-ES', { month: 'long' })
  const assetName = (id: string) => inv.assets.find((a) => a.id === id)?.name ?? ''
  const accName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? 'Cuenta eliminada' : '')

  const saveAsset = useMutation({
    mutationFn: async () => {
      if (!aName.trim()) throw new Error('Escribe el nombre del activo.')
      const r = editingId ? await supabase.from('assets').update({ name: aName.trim() }).eq('id', editingId) : await supabase.from('assets').insert({ name: aName.trim() })
      if (r.error) throw r.error
    },
    onSuccess: () => { setAName(''); setEditingId(null); setAErr(''); setShowAssetForm(false); refresh() },
    onError: (e: Error) => setAErr(e.message),
  })
  const delAsset = useMutation({
    mutationFn: async (id: string) => {
      if (inv.contribs.some((c) => c.asset_id === id) || inv.values.some((v) => v.asset_id === id)) throw new Error('Este activo tiene aportaciones o valores. Elimínalos antes de borrarlo.')
      if (!confirm('¿Eliminar este activo?')) return
      const r = await supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (r.error) throw r.error
    },
    onSuccess: refresh,
    onError: (e: Error) => setAErr(e.message),
  })
  const delContrib = useMutation({
    mutationFn: async (c: Contribution) => { await supabase.from('investment_contributions').delete().eq('id', c.id) },
    onSuccess: refresh,
  })
  const editValue = useMutation({
    mutationFn: async (v: ValueRow) => {
      const s = prompt('Dinero que tenías en ese activo (€):', String(v.value).replace('.', ','))
      if (s === null) return
      const n = parseAmount(s)
      if (isNaN(n) || n < 0) throw new Error('Importe no válido')
      await supabase.from('investment_values').update({ value: Math.round(n * 100) / 100 }).eq('id', v.id)
    },
    onSuccess: refresh,
  })
  const delValue = useMutation({
    mutationFn: async (v: ValueRow) => { await supabase.from('investment_values').delete().eq('id', v.id) },
    onSuccess: refresh,
  })

  const colorOf = (g: number) => (g >= 0 ? '#6FCF9F' : '#EF8A7C')
  const nS = inv.series.length
  const flat = nS > 0 && Math.max(...inv.series.map((x) => x.valor)) === Math.min(...inv.series.map((x) => x.valor))
  const valorStroke = nS < 2 || flat ? colorOf(inv.series[nS - 1]?.ganado ?? 0) : 'url(#valorGrad)'
  const valorDefs = nS < 2 ? null : (
    <defs>
      <linearGradient id="valorGrad" x1="0" y1="0" x2="1" y2="0">
        {inv.series.flatMap((x, i) => [
          <stop key={`a${i}`} offset={Math.max(0, (i - 0.5) / (nS - 1))} stopColor={colorOf(x.ganado)} />,
          <stop key={`b${i}`} offset={Math.min(1, (i + 0.5) / (nS - 1))} stopColor={colorOf(x.ganado)} />,
        ])}
      </linearGradient>
    </defs>
  )
  const pie = inv.positions.filter((x) => x.valor > 0.005).map((x) => ({ name: x.asset.name, value: x.valor, weight: x.weight }))
  const rows = [...inv.series].reverse()
  const byDateDesc = <T extends { date: string }>(a: T[]) => [...a].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-white text-2xl font-bold">Inversiones</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setMonthOpen(true)}>Actualizar mes</button>
          <button className="btn" onClick={() => inv.assets.length ? setContribModal({}) : (setShowAssetForm(true), setTimeout(() => document.getElementById('nuevo-activo')?.scrollIntoView({ behavior: 'smooth' }), 50))}>+ Aportación</button>
        </div>
      </div>

      {inv.error && <p className="text-neg text-sm" role="alert">No se pudieron cargar las inversiones. ¿Has ejecutado el script 0003 en Supabase?</p>}
      {inv.isLoading && <p className="text-mute">Cargando…</p>}

      {inv.pending && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brass">
          <p className="text-sm text-soft">Falta actualizar <b className="text-white">{prevMonthName}</b>: apunta cuánto dinero tienes ahora en cada activo.</p>
          <button className="btn" onClick={() => setMonthOpen(true)}>Actualizar ahora</button>
        </div>
      )}

      {!inv.isLoading && !p.hasOps && (
        <div className="card text-sm text-mute space-y-1">
          <p className="text-white font-semibold">Aún no tienes inversiones registradas.</p>
          <p>1) Crea tu activo abajo (por ejemplo «MSCI World»). 2) Pulsa <b>+ Aportación</b> e indica cuánto has metido. 3) A principios de cada mes, pulsa <b>Actualizar mes</b> y escribe cuánto dinero tienes.</p>
        </div>
      )}

      {p.hasOps && (<>
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Dinero aportado" value={money(p.cost)} />
          <Kpi label="Dinero que tienes" value={money(p.value)} />
          <Kpi label="Ganado" value={signed(p.pnl)} sub={`${sPct(p.pnlPct)} sobre lo aportado`} cls={tone(p.pnl)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="text-white font-semibold mb-2">Evolución de la cartera</h2>
            {inv.series.length < 2 ? <p className="text-mute text-sm py-10">Aparecerá cuando tengas al menos dos meses de datos.</p> :
              <ResponsiveContainer width="100%" height={230}><LineChart data={inv.series.map((s) => ({ d: fmtMonth(s.date), Aportado: s.aportado, Valor: s.valor, Ganado: s.ganado }))}>
                {valorDefs}
                <CartesianGrid stroke="#2A3450" vertical={false} /><XAxis dataKey="d" stroke="#8A93AA" fontSize={12} /><YAxis stroke="#8A93AA" fontSize={12} width={60} />
                <Tooltip content={<ChartTip />} />
                <Line dataKey="Valor" stroke={valorStroke} strokeWidth={2} dot={false} /><Line dataKey="Aportado" stroke="#8A93AA" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart></ResponsiveContainer>}
            {inv.series.length >= 2 && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-xs text-mute">
                <span><span className="inline-block w-3 h-0.5 align-middle mr-1 bg-pos" />Valor, si ganas</span>
                <span><span className="inline-block w-3 h-0.5 align-middle mr-1 bg-neg" />Valor, si pierdes</span>
                <span><span className="inline-block w-3 h-0.5 align-middle mr-1 bg-mute" />Aportado</span>
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="text-white font-semibold mb-2">Reparto por activo</h2>
            {pie.length === 0 ? <p className="text-mute text-sm py-10">Sin dinero invertido.</p> : (<>
              <ResponsiveContainer width="100%" height={180}><PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} stroke="#171D2C">
                  {pie.map((x, i) => <Cell key={x.name} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip {...TIP} formatter={(v: number) => money(v)} />
              </PieChart></ResponsiveContainer>
              <ul className="text-sm space-y-1 mt-2">{pie.map((x, i) => (
                <li key={x.name} className="flex justify-between gap-2"><span className="truncate"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: COLORS[i % COLORS.length] }} />{x.name}</span>
                  <span className="text-white whitespace-nowrap">{pctFmt(x.weight, 1)} · {money(x.value)}</span></li>))}
              </ul></>)}
          </div>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-2">Por activo</h2>
          <ul className="space-y-2">
            {inv.positions.map((x) => (
              <li key={x.asset.id} className="card flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="text-white truncate">{x.asset.name}</div>
                  <div className="text-xs text-mute">Aportado {money(x.aportado)} · tienes {money(x.valor)}</div></div>
                <div className={`text-sm font-semibold ${tone(x.ganado)}`}>{signed(x.ganado)} ({sPct(x.pct)})</div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-2">Por años</h2>
          {inv.years.length === 0 ? <p className="text-mute text-sm">Se rellena al actualizar el primer mes.</p> : (
            <div className="card overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-mute text-left"><tr><th className="py-1 pr-3 font-normal">Año</th><th className="pr-3 font-normal">Aportado</th><th className="pr-3 font-normal">Ganado</th><th className="font-normal text-right">Rentabilidad</th></tr></thead>
              <tbody>
                {[...inv.years].reverse().map((y) => (
                  <tr key={y.year} className="border-t border-line"><td className="py-2 pr-3 text-white">{y.year}</td><td className="pr-3">{money(y.contrib)}</td>
                    <td className={`pr-3 ${tone(y.gain)}`}>{signed(y.gain)}</td><td className={`text-right ${tone(y.pct)}`}>{sPct(y.pct)}</td></tr>
                ))}
                <tr className="border-t border-line font-semibold"><td className="py-2 pr-3 text-white">Total</td><td className="pr-3">{money(p.cost)}</td>
                  <td className={`pr-3 ${tone(p.pnl)}`}>{signed(p.pnl)}</td><td className={`text-right ${tone(inv.totalPct)}`}>{sPct(inv.totalPct)}</td></tr>
              </tbody>
            </table></div>
          )}
          <p className="text-xs text-mute mt-1">La rentabilidad encadena los meses, así que no depende de cuándo aportaste.</p>
        </div>

        <div>
          <h2 className="text-white font-semibold mb-2">Mes a mes</h2>
          {rows.length === 0 ? <p className="text-mute text-sm">Aún no hay meses cerrados.</p> : (
            <div className="card overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">
              <thead className="text-mute text-left"><tr><th className="py-1 pr-3 font-normal">Mes</th><th className="pr-3 font-normal">Aportado</th><th className="pr-3 font-normal">Tienes</th><th className="pr-3 font-normal">Ganado</th><th className="font-normal text-right">%</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-t border-line"><td className="py-2 pr-3 text-white">{fmtMonth(r.date)}</td><td className="pr-3">{r.monthContrib === 0 ? '—' : money(r.monthContrib)}</td>
                    <td className="pr-3">{money(r.valor)}</td><td className={`pr-3 ${tone(r.monthGain)}`}>{signed(r.monthGain)}</td><td className={`text-right ${tone(r.monthPct)}`}>{sPct(r.monthPct)}</td></tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p className="text-xs text-mute mt-1">«Aportado» es lo que metiste ese mes. Si te saltas un mes, la ganancia se junta en el siguiente.</p>
        </div>

        <details className="card">
          <summary className="cursor-pointer text-white font-semibold">Ver y corregir historial</summary>
          <div className="mt-4 space-y-5">
            <div>
              <h3 className="text-soft text-sm mb-2">Aportaciones y retiradas</h3>
              <ul className="space-y-2">
                {byDateDesc(inv.contribs).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-16 text-mute">{fmtDate(c.date)}</span>
                    <span className="flex-1 min-w-0 truncate text-white">{assetName(c.asset_id)}{c.account_id && <span className="text-xs text-mute"> · {accName(c.account_id)}</span>}</span>
                    <span className={c.amount >= 0 ? 'text-white' : 'text-neg'}>{c.amount >= 0 ? '' : '−'}{money(Math.abs(c.amount))}</span>
                    <button className="btn-ghost text-xs" onClick={() => setContribModal({ c })}>Editar</button>
                    <button className="btn-ghost text-xs text-neg" onClick={() => confirm('¿Eliminar? Si descontó dinero de una cuenta, volverá a ella.') && delContrib.mutate(c)}>Eliminar</button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-soft text-sm mb-2">Valores mensuales</h3>
              {inv.values.length === 0 && <p className="text-mute text-sm">Aún no has registrado ninguno.</p>}
              <ul className="space-y-2">
                {byDateDesc(inv.values).map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-16 text-mute">{fmtDate(v.date)}</span>
                    <span className="flex-1 min-w-0 truncate text-white">{assetName(v.asset_id)}</span>
                    <span>{money(v.value)}</span>
                    <button className="btn-ghost text-xs" onClick={() => editValue.mutate(v)}>Editar</button>
                    <button className="btn-ghost text-xs text-neg" onClick={() => confirm('¿Eliminar este valor?') && delValue.mutate(v)}>Eliminar</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </>)}

      <section id="nuevo-activo" className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">Mis activos</h2>
          <AddButton label="Añadir activo" onClick={() => { setEditingId(null); setAName(''); setAErr(''); setShowAssetForm(true) }} />
        </div>
        {inv.assets.length === 0 && <p className="text-sm text-mute">Aún no has creado ningún activo. Pulsa + para añadir el primero.</p>}
        <ul className="space-y-2">
          {inv.assets.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-white">{a.name}</span>
              <button type="button" className="btn-ghost text-xs" onClick={() => { setEditingId(a.id); setAName(a.name); setAErr('') }}>Renombrar</button>
              <button type="button" className="btn-ghost text-xs text-neg" onClick={() => delAsset.mutate(a.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
        {aErr && <p className="text-neg text-sm" role="alert">{aErr}</p>}
        {(showAssetForm || editingId) && (
          <form className="space-y-3 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); saveAsset.mutate() }}>
            <div><label className="label" htmlFor="an">{editingId ? 'Nuevo nombre' : 'Nombre del activo'}</label>
              <input id="an" className="input" placeholder="Ej. MSCI World" value={aName} onChange={(e) => setAName(e.target.value)} autoFocus /></div>
            <div className="flex gap-2"><button className="btn" disabled={saveAsset.isPending}>{editingId ? 'Guardar nombre' : 'Añadir'}</button>
              <button type="button" className="btn-ghost" onClick={closeAssetForm}>Cancelar</button></div>
          </form>
        )}
      </section>

      {contribModal && <ContributionModal assets={inv.assets} values={inv.values} contrib={contribModal.c} onClose={() => setContribModal(null)} />}
      {monthOpen && <MonthUpdateModal positions={inv.positions} estimateAt={inv.estimateAt} lastValueOf={inv.lastValueOf} onClose={() => setMonthOpen(false)} />}
    </div>
  )
}
