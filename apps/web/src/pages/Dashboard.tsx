import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import Alerts from '../components/Alerts'
import { pctFmt, useInvestments } from '../lib/investments'
import { addMonths, fmtMonth, money, monthStart, ymd } from '../lib/format'

const PRESETS: Record<string, string> = {
  actual: 'Mes actual', anterior: 'Mes anterior', '3m': 'Últimos 3 meses', '6m': 'Últimos 6 meses',
  anio: 'Año actual', anioAnt: 'Año anterior', custom: 'Personalizado',
}

function range(p: string, cFrom: string, cTo: string): [Date, Date] {
  const now = monthStart(new Date())
  switch (p) {
    case 'anterior': return [addMonths(now, -1), now]
    case '3m': return [addMonths(now, -2), addMonths(now, 1)]
    case '6m': return [addMonths(now, -5), addMonths(now, 1)]
    case 'anio': return [new Date(now.getFullYear(), 0, 1), addMonths(now, 1)]
    case 'anioAnt': return [new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1)]
    case 'custom': return [new Date(cFrom + '-01T00:00:00'), addMonths(new Date(cTo + '-01T00:00:00'), 1)]
    default: return [now, addMonths(now, 1)]
  }
}

const TIP = { contentStyle: { background: '#1E2638', border: '1px solid #2A3450', borderRadius: 8 }, labelStyle: { color: '#C3C9D9' } }

function Kpi({ label, value, tone, wide }: { label: string; value: string; tone?: string; wide?: boolean }) {
  return <div className={`card ${wide ? 'col-span-2 md:col-span-1' : ''}`}><div className="text-mute text-sm">{label}</div><div className={`text-xl font-bold ${tone ?? 'text-white'}`}>{value}</div></div>
}

export default function Dashboard() {
  const qc = useQueryClient()
  const [preset, setPreset] = useState('actual')
  const [cFrom, setCFrom] = useState(ymd(addMonths(new Date(), -2)).slice(0, 7))
  const [cTo, setCTo] = useState(ymd(new Date()).slice(0, 7))
  const [from, to] = range(preset, cFrom, cTo)
  const f = ymd(from), t = ymd(to)

  // Mantiene el snapshot de hoy al día
  useEffect(() => { supabase.rpc('take_snapshot').then(() => qc.invalidateQueries({ queryKey: ['snapshots'] })) }, [qc])

  const snaps = useQuery({
    queryKey: ['snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase.from('net_worth_snapshots').select('*').order('date')
      if (error) throw error
      return data as any[]
    },
  })
  const flow = useQuery({
    queryKey: ['flow', f, t],
    queryFn: async () => {
      const { data, error } = await supabase.from('monthly_flow').select('*').gte('month', f).lt('month', t).order('month')
      if (error) throw error
      return data as any[]
    },
  })
  const cats = useQuery({
    queryKey: ['catspend', f, t],
    queryFn: async () => {
      const { data, error } = await supabase.from('monthly_category_spend').select('*').gte('month', f).lt('month', t)
      if (error) throw error
      const m = new Map<string, { name: string; value: number; color: string }>()
      for (const r of data as any[]) {
        const cur = m.get(r.category) ?? { name: r.category, value: 0, color: r.color ?? '#8A93AA' }
        cur.value += Number(r.spent); m.set(r.category, cur)
      }
      return [...m.values()].sort((a, b) => b.value - a.value)
    },
  })

  const last = snaps.data?.[snaps.data.length - 1]
  const income = (flow.data ?? []).reduce((s, r) => s + Number(r.income), 0)
  const expense = (flow.data ?? []).reduce((s, r) => s + Number(r.expense), 0)
  const saving = income - expense
  const rate = income > 0 ? (saving / income) * 100 : 0
  const nwSeries = (snaps.data ?? []).filter((s) => s.date >= f && s.date < t).map((s) => ({ d: fmtMonth(s.date), v: Number(s.net_worth) }))
  const flowSeries = (flow.data ?? []).map((r) => ({ d: fmtMonth(r.month), Ingresos: Number(r.income), Gastos: Number(r.expense) }))
  const compo = last ? [
    { name: 'Cuentas', value: Number(last.bank) }, { name: 'Efectivo', value: Number(last.cash) },
    { name: 'Inversiones', value: Number(last.investments) }, { name: 'Inmuebles', value: Number(last.real_estate) },
  ] : []

  const inv = useInvestments()
  const rateSeries = (flow.data ?? []).map((r) => ({ d: fmtMonth(r.month), v: Number(r.income) > 0 ? ((Number(r.income) - Number(r.expense)) / Number(r.income)) * 100 : 0 }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-mute text-sm">Patrimonio neto</div>
          <div className="text-white text-4xl font-bold">{money(last?.net_worth)}</div>
        </div>
        <div className="flex gap-2 items-center">
          <select className="input w-auto" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Periodo">
            {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {preset === 'custom' && <>
            <input type="month" className="input w-auto" value={cFrom} onChange={(e) => setCFrom(e.target.value)} aria-label="Desde" />
            <input type="month" className="input w-auto" value={cTo} onChange={(e) => setCTo(e.target.value)} aria-label="Hasta" />
          </>}
        </div>
      </div>

      <Alerts />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="Activos totales" value={money(last?.assets_total)} />
        <Kpi label="Pasivos totales" value={money(last?.liabilities)} />
        <Kpi label="Dinero disponible" value={money(Number(last?.bank ?? 0) + Number(last?.cash ?? 0))} />
        <Kpi label="Total invertido" value={money(last?.investments)} />
        <Kpi label="Rentabilidad inversiones" value={pctFmt(inv.portfolio.pnlPct)} tone={inv.portfolio.pnl >= 0 ? 'text-pos' : 'text-neg'} />
        <Kpi label="Ingresos" value={money(income)} tone="text-pos" />
        <Kpi label="Gastos" value={money(expense)} tone="text-neg" />
        <Kpi label="Ahorro" value={money(saving)} tone={saving >= 0 ? 'text-pos' : 'text-neg'} />
        <Kpi label="Tasa de ahorro" value={`${rate.toFixed(1)} %`} wide />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-white font-semibold mb-2">Evolución del patrimonio</h2>
          {nwSeries.length < 2 ? <p className="text-mute text-sm py-10">Aún no hay histórico suficiente. Se genera solo cada día; para reconstruirlo desde tus movimientos antiguos usa Ajustes.</p> :
            <ResponsiveContainer width="100%" height={220}><LineChart data={nwSeries}>
              <CartesianGrid stroke="#2A3450" vertical={false} /><XAxis dataKey="d" stroke="#8A93AA" fontSize={12} /><YAxis stroke="#8A93AA" fontSize={12} width={60} />
              <Tooltip {...TIP} formatter={(v: number) => money(v)} /><Line dataKey="v" name="Patrimonio" stroke="#E0B25A" strokeWidth={2} dot={false} />
            </LineChart></ResponsiveContainer>}
        </div>
        <div className="card">
          <h2 className="text-white font-semibold mb-2">Ingresos y gastos</h2>
          {flowSeries.length === 0 ? <p className="text-mute text-sm py-10">Sin movimientos en este periodo.</p> :
            <ResponsiveContainer width="100%" height={220}><BarChart data={flowSeries}>
              <CartesianGrid stroke="#2A3450" vertical={false} /><XAxis dataKey="d" stroke="#8A93AA" fontSize={12} /><YAxis stroke="#8A93AA" fontSize={12} width={60} />
              <Tooltip {...TIP} formatter={(v: number) => money(v)} /><Legend />
              <Bar dataKey="Ingresos" fill="#6FCF9F" radius={[4, 4, 0, 0]} /><Bar dataKey="Gastos" fill="#EF8A7C" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer>}
        </div>
        <div className="card">
          <h2 className="text-white font-semibold mb-2">Gastos por categoría</h2>
          {(cats.data ?? []).length === 0 ? <p className="text-mute text-sm py-10">Sin gastos en este periodo.</p> : <>
            <ResponsiveContainer width="100%" height={200}><PieChart>
              <Pie data={cats.data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} stroke="#171D2C">
                {cats.data!.map((c) => <Cell key={c.name} fill={c.color} />)}
              </Pie><Tooltip {...TIP} formatter={(v: number) => money(v)} />
            </PieChart></ResponsiveContainer>
            <ul className="text-sm space-y-1 mt-2">{cats.data!.slice(0, 6).map((c) => (
              <li key={c.name} className="flex justify-between"><span><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: c.color }} />{c.name}</span><span className="text-white">{money(c.value)}</span></li>))}
            </ul></>}
        </div>
        <div className="card">
          <h2 className="text-white font-semibold mb-2">Composición del patrimonio</h2>
          {compo.every((c) => c.value === 0) ? <p className="text-mute text-sm py-10">Añade cuentas e inversiones para ver la composición.</p> :
            <ul className="space-y-3 pt-2">{compo.map((c) => (
              <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="text-white font-semibold">{money(c.value)}</span></li>))}
            </ul>}
        </div>
        <div className="card">
          <h2 className="text-white font-semibold mb-2">Evolución de la cartera</h2>
          {inv.series.length < 2 ? <p className="text-mute text-sm py-10">Aún no hay histórico suficiente.</p> :
            <ResponsiveContainer width="100%" height={220}><LineChart data={inv.series.map((x) => ({ d: fmtMonth(x.date), Valor: x.value, Aportado: x.contributed }))}>
              <CartesianGrid stroke="#2A3450" vertical={false} /><XAxis dataKey="d" stroke="#8A93AA" fontSize={12} /><YAxis stroke="#8A93AA" fontSize={12} width={60} />
              <Tooltip {...TIP} formatter={(v: number) => money(v)} /><Legend />
              <Line dataKey="Valor" stroke="#E0B25A" strokeWidth={2} dot={false} /><Line dataKey="Aportado" stroke="#8A93AA" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart></ResponsiveContainer>}
        </div>
        <div className="card">
          <h2 className="text-white font-semibold mb-2">Evolución de la tasa de ahorro</h2>
          {rateSeries.length === 0 ? <p className="text-mute text-sm py-10">Sin movimientos en este periodo.</p> :
            <ResponsiveContainer width="100%" height={220}><LineChart data={rateSeries}>
              <CartesianGrid stroke="#2A3450" vertical={false} /><XAxis dataKey="d" stroke="#8A93AA" fontSize={12} /><YAxis stroke="#8A93AA" fontSize={12} width={50} unit=" %" />
              <Tooltip {...TIP} formatter={(v: number) => `${v.toFixed(1)} %`} /><Line dataKey="v" name="Tasa de ahorro" stroke="#6FCF9F" strokeWidth={2} dot={false} />
            </LineChart></ResponsiveContainer>}
        </div>
      </div>
    </div>
  )
}
