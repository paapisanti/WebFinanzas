import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAccounts, useAdvanced } from '../lib/hooks'

export default function Settings() {
  const [msg, setMsg] = useState('')
  const [qr, setQr] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const qc = useQueryClient()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.archived && a.type !== 'inversion')
  const def = useQuery({
    queryKey: ['settings-default'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('default_account_id').maybeSingle()
      return (data?.default_account_id as string | null) ?? ''
    },
  })
  const adv = useAdvanced()
  async function setAdvanced(on: boolean) {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return
    const { error } = await supabase.from('settings').update({ advanced_mode: on }).eq('user_id', u.user.id)
    setMsg(error ? `Error: ${error.message}. ¿Has ejecutado el script 0004 en Supabase?` : on ? 'Modo avanzado activado.' : 'Modo avanzado desactivado.')
    qc.invalidateQueries({ queryKey: ['advanced'] })
  }
  async function setDefault(id: string) {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return
    const { error } = await supabase.from('settings').update({ default_account_id: id || null }).eq('user_id', u.user.id)
    setMsg(error ? `Error: ${error.message}` : 'Cuenta por defecto guardada.')
    qc.invalidateQueries({ queryKey: ['settings-default'] })
  }

  async function rebuild() {
    setMsg('Reconstruyendo…')
    const { data, error } = await supabase.rpc('rebuild_snapshots')
    setMsg(error ? `Error: ${error.message}` : `Histórico reconstruido (${data} puntos).`)
  }
  async function enroll() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error) { setMsg(error.message); return }
    setQr(data.totp.qr_code); setFactorId(data.id)
  }
  async function verify() {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setMsg(error ? 'Código incorrecto.' : 'Verificación en dos pasos activada.')
    if (!error) setQr('')
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-white text-2xl font-bold">Ajustes</h1>

      <section className="card space-y-3">
        <h2 className="text-white font-semibold">Histórico de patrimonio</h2>
        <p className="text-sm text-mute">Úsalo si has editado o añadido movimientos antiguos y el gráfico no cuadra.</p>
        <button className="btn-ghost" onClick={rebuild}>Reconstruir histórico</button>
      </section>

      <section className="card space-y-3">
        <h2 className="text-white font-semibold">Verificación en dos pasos</h2>
        {!qr ? <button className="btn-ghost" onClick={enroll}>Activar con app de autenticación</button> : (
          <div className="space-y-3">
            <p className="text-sm text-mute">Escanea el código con tu app de autenticación e introduce el código que muestra.</p>
            <img src={qr} alt="Código QR" className="bg-white p-2 rounded-lg w-44 h-44" />
            <input className="input" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" onClick={verify}>Confirmar</button>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-white font-semibold">Modo avanzado</h2>
        <p className="text-sm text-mute">Añade la sección Patrimonio, con inmuebles, hipotecas, préstamos y otras deudas, y muestra los pasivos en el Resumen.</p>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={adv.data ?? false} onChange={(e) => setAdvanced(e.target.checked)} />
          <span className="text-white">Activar modo avanzado</span>
        </label>
      </section>

      <section className="card space-y-3">
        <h2 className="text-white font-semibold">Telegram</h2>
        <p className="text-sm text-mute">Cuenta en la que se apuntan los gastos que envías al bot cuando no indicas otra (por ejemplo, «5 café @efectivo» usa la cuenta efectivo).</p>
        <label className="label" htmlFor="dfa">Cuenta por defecto</label>
        <select id="dfa" className="input" value={def.data ?? ''} onChange={(e) => setDefault(e.target.value)}>
          <option value="">La primera cuenta que creaste</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.entity} · {a.name}</option>)}
        </select>
      </section>

      <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      {msg && <p className="text-sm text-brass" role="status">{msg}</p>}
    </div>
  )
}
