import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fmtDate, money, parseAmount, today } from '../lib/format'
import AddButton from '../components/AddButton'

type PropType = 'vivienda' | 'local' | 'otro'
type LiabType = 'hipoteca' | 'prestamo' | 'otra'
const PROP_LABEL: Record<PropType, string> = { vivienda: 'Vivienda', local: 'Local', otro: 'Otro inmueble' }
const LIAB_LABEL: Record<LiabType, string> = { hipoteca: 'Hipoteca', prestamo: 'Préstamo', otra: 'Otra deuda' }
interface Prop { id: string; name: string; type: PropType; purchase_price: number | null; purchase_date: string | null; archived: boolean }
interface Val { id: string; real_estate_id: string; date: string; value: number }
interface Liab { id: string; name: string; type: LiabType; archived: boolean }
interface Bal { id: string; liability_id: string; date: string; balance: number }

const byDateDesc = <T extends { date: string }>(a: T[]) => [...a].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))

// Pequeña ventana para anotar un importe con su fecha (tasación o saldo pendiente)
function AmountDateModal({ title, label, onSave, onClose }: { title: string; label: string; onSave: (date: string, amount: number) => Promise<void>; onClose: () => void }) {
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseAmount(amount)
    if (isNaN(n) || n < 0 || amount.trim() === '') { setError('Introduce un importe válido.'); return }
    setBusy(true)
    try { await onSave(date, Math.round(n * 100) / 100); onClose() } catch (err) { setError((err as Error).message); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="bg-panel border border-line w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-white font-bold text-lg">{title}</h2>
          <button type="button" className="text-mute px-2" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <div><label className="label" htmlFor="am">{label}</label><input id="am" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div><label className="label" htmlFor="ad">Fecha</label><input id="ad" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={busy}>Guardar</button>
      </form>
    </div>
  )
}

export default function Patrimonio() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['patrimonio'],
    queryFn: async () => {
      const [p, v, l, b] = await Promise.all([
        supabase.from('real_estate').select('*').order('name'),
        supabase.from('real_estate_valuations').select('*'),
        supabase.from('liabilities').select('*').order('name'),
        supabase.from('liability_balances').select('*'),
      ])
      for (const r of [p, v, l, b]) if (r.error) throw r.error
      return {
        props: (p.data as any[]).map((x) => ({ ...x, purchase_price: x.purchase_price === null ? null : Number(x.purchase_price) })) as Prop[],
        vals: (v.data as any[]).map((x) => ({ ...x, value: Number(x.value) })) as Val[],
        liabs: l.data as Liab[],
        bals: (b.data as any[]).map((x) => ({ ...x, balance: Number(x.balance) })) as Bal[],
      }
    },
  })
  const props = q.data?.props ?? [], vals = q.data?.vals ?? [], liabs = q.data?.liabs ?? [], bals = q.data?.bals ?? []
  const [msg, setMsg] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [valModal, setValModal] = useState<Prop | null>(null)
  const [balModal, setBalModal] = useState<Liab | null>(null)

  async function refresh() { await supabase.rpc('take_snapshot'); qc.invalidateQueries() }
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    const r = await fn()
    if (r.error) setMsg(`Error: ${r.error.message}`); else setMsg('')
    await refresh()
  }

  const valuesOf = (id: string) => byDateDesc(vals.filter((v) => v.real_estate_id === id))
  const balancesOf = (id: string) => byDateDesc(bals.filter((b) => b.liability_id === id))
  const propValue = (p: Prop) => valuesOf(p.id)[0]?.value ?? p.purchase_price ?? 0
  const liabBalance = (l: Liab) => balancesOf(l.id)[0]?.balance ?? 0
  const livePs = props.filter((p) => !p.archived), liveLs = liabs.filter((l) => !l.archived)
  const totalProps = livePs.reduce((s, p) => s + propValue(p), 0)
  const totalDebt = liveLs.reduce((s, l) => s + liabBalance(l), 0)
  const debtBy = (t: LiabType) => liveLs.filter((l) => l.type === t).reduce((s, l) => s + liabBalance(l), 0)

  // --- Formulario inmueble ---
  const [showP, setShowP] = useState(false)
  const [editP, setEditP] = useState<Prop | null>(null)
  const [pName, setPName] = useState(''); const [pType, setPType] = useState<PropType>('vivienda')
  const [pPrice, setPPrice] = useState(''); const [pDate, setPDate] = useState(''); const [pValue, setPValue] = useState('')
  const closeP = () => { setShowP(false); setEditP(null); setPName(''); setPType('vivienda'); setPPrice(''); setPDate(''); setPValue('') }
  async function saveProp(e: React.FormEvent) {
    e.preventDefault()
    if (!pName.trim()) { setMsg('Escribe el nombre del inmueble.'); return }
    const price = pPrice.trim() ? parseAmount(pPrice) : null
    if (price !== null && (isNaN(price) || price < 0)) { setMsg('El precio de compra no es válido.'); return }
    const row = { name: pName.trim(), type: pType, purchase_price: price, purchase_date: pDate || null }
    if (editP) await run(() => supabase.from('real_estate').update(row).eq('id', editP.id))
    else {
      const { data, error } = await supabase.from('real_estate').insert(row).select('id').single()
      if (error) { setMsg(`Error: ${error.message}`); return }
      const v = pValue.trim() ? parseAmount(pValue) : NaN
      if (!isNaN(v) && v >= 0) await supabase.from('real_estate_valuations').insert({ real_estate_id: data.id, date: today(), value: v })
      await refresh()
    }
    closeP()
  }

  // --- Formulario deuda ---
  const [showL, setShowL] = useState(false)
  const [editL, setEditL] = useState<Liab | null>(null)
  const [lName, setLName] = useState(''); const [lType, setLType] = useState<LiabType>('hipoteca'); const [lBal, setLBal] = useState('')
  const closeL = () => { setShowL(false); setEditL(null); setLName(''); setLType('hipoteca'); setLBal('') }
  async function saveLiab(e: React.FormEvent) {
    e.preventDefault()
    if (!lName.trim()) { setMsg('Escribe el nombre de la deuda.'); return }
    const row = { name: lName.trim(), type: lType }
    if (editL) await run(() => supabase.from('liabilities').update(row).eq('id', editL.id))
    else {
      const { data, error } = await supabase.from('liabilities').insert(row).select('id').single()
      if (error) { setMsg(`Error: ${error.message}`); return }
      const b = lBal.trim() ? parseAmount(lBal) : NaN
      if (!isNaN(b) && b >= 0) await supabase.from('liability_balances').insert({ liability_id: data.id, date: today(), balance: b })
      await refresh()
    }
    closeL()
  }

  return (
    <div className="space-y-8">
      <h1 className="text-white text-2xl font-bold">Patrimonio · modo avanzado</h1>
      {q.error && <p className="text-neg text-sm" role="alert">No se pudieron cargar los datos.</p>}
      {msg && <p className="text-sm text-brass" role="status">{msg}</p>}

      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="text-mute text-sm">Inmuebles</div><div className="text-white text-xl font-bold">{money(totalProps)}</div></div>
        <div className="card"><div className="text-mute text-sm">Deudas</div><div className="text-white text-xl font-bold">{money(totalDebt)}</div>
          {totalDebt > 0 && <div className="text-xs text-mute mt-1">{(['hipoteca', 'prestamo', 'otra'] as LiabType[]).filter((t) => debtBy(t) > 0).map((t) => `${LIAB_LABEL[t]} ${money(debtBy(t))}`).join(' · ')}</div>}</div>
        <div className="card"><div className="text-mute text-sm">Valor neto inmuebles</div><div className={`text-xl font-bold ${totalProps - totalDebt >= 0 ? 'text-white' : 'text-neg'}`}>{money(totalProps - totalDebt)}</div></div>
      </div>
      <p className="text-xs text-mute -mt-5">Esto se suma al patrimonio neto del Resumen. Si añades datos antiguos, usa «Reconstruir histórico» en Ajustes.</p>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-white font-semibold text-lg">Inmuebles</h2>
          <AddButton label="Añadir inmueble" onClick={() => { closeP(); setShowP(true) }} /></div>
        {livePs.length === 0 && !showP && <p className="text-mute text-sm">No tienes inmuebles. Pulsa + para añadir uno.</p>}
        <ul className="space-y-2">
          {props.filter((p) => showArchived || !p.archived).map((p) => (
            <li key={p.id} className={`card space-y-2 ${p.archived ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="text-white truncate">{p.name}{p.archived && ' · archivado'}</div>
                  <div className="text-xs text-mute">{PROP_LABEL[p.type]}{p.purchase_price !== null && ` · compra ${money(p.purchase_price)}`}{p.purchase_date && ` (${fmtDate(p.purchase_date)})`}</div></div>
                <div className="text-right"><div className="text-white font-semibold">{money(propValue(p))}</div>
                  <div className="text-xs text-mute">{valuesOf(p.id)[0] ? `tasación ${fmtDate(valuesOf(p.id)[0].date)}` : 'precio de compra'}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost text-sm" onClick={() => setValModal(p)}>Actualizar valor</button>
                <button className="btn-ghost text-sm" onClick={() => setOpen({ ...open, [p.id]: !open[p.id] })}>{open[p.id] ? 'Ocultar historial' : 'Historial'}</button>
                <button className="btn-ghost text-sm" onClick={() => { setEditP(p); setPName(p.name); setPType(p.type); setPPrice(p.purchase_price === null ? '' : String(p.purchase_price).replace('.', ',')); setPDate(p.purchase_date ?? ''); setShowP(true) }}>Editar</button>
                <button className="btn-ghost text-sm" onClick={() => run(() => supabase.from('real_estate').update({ archived: !p.archived }).eq('id', p.id))}>{p.archived ? 'Restaurar' : 'Archivar'}</button>
                <button className="btn-ghost text-sm text-neg" onClick={() => confirm(`¿Eliminar "${p.name}" y todo su historial de tasaciones?`) && run(() => supabase.from('real_estate').delete().eq('id', p.id))}>Eliminar</button>
              </div>
              {open[p.id] && (
                <ul className="border-t border-line pt-2 space-y-1 text-sm">
                  {valuesOf(p.id).length === 0 && <li className="text-mute">Sin tasaciones registradas.</li>}
                  {valuesOf(p.id).map((v) => (
                    <li key={v.id} className="flex items-center gap-2"><span className="w-20 text-mute">{fmtDate(v.date)}</span><span className="flex-1 text-white">{money(v.value)}</span>
                      <button className="btn-ghost text-xs text-neg" onClick={() => confirm('¿Eliminar esta tasación?') && run(() => supabase.from('real_estate_valuations').delete().eq('id', v.id))}>Eliminar</button></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {showP && (
          <form className="card space-y-3" onSubmit={saveProp}>
            <h3 className="text-white font-semibold">{editP ? 'Editar inmueble' : 'Nuevo inmueble'}</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className="label" htmlFor="pn">Nombre</label><input id="pn" className="input" value={pName} onChange={(e) => setPName(e.target.value)} autoFocus /></div>
              <div><label className="label" htmlFor="pt">Tipo</label>
                <select id="pt" className="input" value={pType} onChange={(e) => setPType(e.target.value as PropType)}>{Object.entries(PROP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label" htmlFor="pp">Precio de compra (€, opcional)</label><input id="pp" className="input" inputMode="decimal" value={pPrice} onChange={(e) => setPPrice(e.target.value)} /></div>
              <div><label className="label" htmlFor="pd">Fecha de compra (opcional)</label><input id="pd" type="date" className="input" value={pDate} onChange={(e) => setPDate(e.target.value)} /></div>
              {!editP && <div className="md:col-span-2"><label className="label" htmlFor="pv">Valor actual estimado (€, opcional)</label><input id="pv" className="input" inputMode="decimal" value={pValue} onChange={(e) => setPValue(e.target.value)} />
                <p className="text-xs text-mute mt-1">Si no lo indicas, se usa el precio de compra hasta que registres una tasación.</p></div>}
            </div>
            <div className="flex gap-2"><button className="btn">{editP ? 'Guardar cambios' : 'Añadir inmueble'}</button><button type="button" className="btn-ghost" onClick={closeP}>Cancelar</button></div>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-white font-semibold text-lg">Deudas</h2>
          <AddButton label="Añadir deuda" onClick={() => { closeL(); setShowL(true) }} /></div>
        {liveLs.length === 0 && !showL && <p className="text-mute text-sm">No tienes deudas registradas. Pulsa + para añadir una hipoteca, un préstamo u otra deuda.</p>}
        <ul className="space-y-2">
          {liabs.filter((l) => showArchived || !l.archived).map((l) => (
            <li key={l.id} className={`card space-y-2 ${l.archived ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="text-white truncate">{l.name}{l.archived && ' · archivada'}</div><div className="text-xs text-mute">{LIAB_LABEL[l.type]}</div></div>
                <div className="text-right"><div className="text-white font-semibold">{money(liabBalance(l))}</div>
                  <div className="text-xs text-mute">{balancesOf(l.id)[0] ? `pendiente a ${fmtDate(balancesOf(l.id)[0].date)}` : 'sin saldo registrado'}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost text-sm" onClick={() => setBalModal(l)}>Actualizar saldo</button>
                <button className="btn-ghost text-sm" onClick={() => setOpen({ ...open, [l.id]: !open[l.id] })}>{open[l.id] ? 'Ocultar historial' : 'Historial'}</button>
                <button className="btn-ghost text-sm" onClick={() => { setEditL(l); setLName(l.name); setLType(l.type); setShowL(true) }}>Editar</button>
                <button className="btn-ghost text-sm" onClick={() => run(() => supabase.from('liabilities').update({ archived: !l.archived }).eq('id', l.id))}>{l.archived ? 'Restaurar' : 'Archivar'}</button>
                <button className="btn-ghost text-sm text-neg" onClick={() => confirm(`¿Eliminar "${l.name}" y todo su historial de saldos?`) && run(() => supabase.from('liabilities').delete().eq('id', l.id))}>Eliminar</button>
              </div>
              {open[l.id] && (
                <ul className="border-t border-line pt-2 space-y-1 text-sm">
                  {balancesOf(l.id).length === 0 && <li className="text-mute">Sin saldos registrados.</li>}
                  {balancesOf(l.id).map((b) => (
                    <li key={b.id} className="flex items-center gap-2"><span className="w-20 text-mute">{fmtDate(b.date)}</span><span className="flex-1 text-white">{money(b.balance)}</span>
                      <button className="btn-ghost text-xs text-neg" onClick={() => confirm('¿Eliminar este saldo?') && run(() => supabase.from('liability_balances').delete().eq('id', b.id))}>Eliminar</button></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {showL && (
          <form className="card space-y-3" onSubmit={saveLiab}>
            <h3 className="text-white font-semibold">{editL ? 'Editar deuda' : 'Nueva deuda'}</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className="label" htmlFor="ln">Nombre</label><input id="ln" className="input" placeholder="Ej. Hipoteca vivienda" value={lName} onChange={(e) => setLName(e.target.value)} autoFocus /></div>
              <div><label className="label" htmlFor="lt">Tipo</label>
                <select id="lt" className="input" value={lType} onChange={(e) => setLType(e.target.value as LiabType)}>{Object.entries(LIAB_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {!editL && <div className="md:col-span-2"><label className="label" htmlFor="lb">Saldo pendiente actual (€)</label><input id="lb" className="input" inputMode="decimal" value={lBal} onChange={(e) => setLBal(e.target.value)} /></div>}
            </div>
            <div className="flex gap-2"><button className="btn">{editL ? 'Guardar cambios' : 'Añadir deuda'}</button><button type="button" className="btn-ghost" onClick={closeL}>Cancelar</button></div>
          </form>
        )}
        <p className="text-xs text-mute">Actualiza el saldo pendiente de vez en cuando (por ejemplo, cada mes o cada trimestre): así el patrimonio refleja lo que vas amortizando. Las tarjetas de crédito no se registran como deuda.</p>
      </section>

      <label className="flex items-center gap-2 text-sm text-mute">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar archivados
      </label>

      {valModal && <AmountDateModal title={`Valor de ${valModal.name}`} label="Valor de mercado o tasación (€)" onClose={() => setValModal(null)}
        onSave={async (date, value) => { const r = await supabase.from('real_estate_valuations').upsert({ real_estate_id: valModal.id, date, value }, { onConflict: 'real_estate_id,date' }); if (r.error) throw r.error; await refresh() }} />}
      {balModal && <AmountDateModal title={`Saldo de ${balModal.name}`} label="Saldo pendiente (€)" onClose={() => setBalModal(null)}
        onSave={async (date, balance) => { const r = await supabase.from('liability_balances').upsert({ liability_id: balModal.id, date, balance }, { onConflict: 'liability_id,date' }); if (r.error) throw r.error; await refresh() }} />}
    </div>
  )
}
