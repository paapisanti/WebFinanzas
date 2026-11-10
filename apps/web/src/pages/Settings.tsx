import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const [msg, setMsg] = useState('')
  const [qr, setQr] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')

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

      <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      {msg && <p className="text-sm text-brass" role="status">{msg}</p>}
    </div>
  )
}
