import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email o contraseña incorrectos.')
    setBusy(false)
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <h1 className="text-white text-xl font-bold">Finanzas</h1>
        <div><label className="label" htmlFor="e">Email</label>
          <input id="e" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className="label" htmlFor="p">Contraseña</label>
          <input id="p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full" disabled={busy}>Entrar</button>
      </form>
    </div>
  )
}

export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { data: f } = await supabase.auth.mfa.listFactors()
    const factor = f?.totp?.[0]
    if (!factor) { setError('No hay ningún factor configurado.'); return }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    if (error) setError('Código incorrecto. Prueba con el siguiente.')
    else onDone()
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={verify} className="card w-full max-w-sm space-y-4">
        <h1 className="text-white text-xl font-bold">Verificación en dos pasos</h1>
        <p className="text-mute text-sm">Introduce el código de 6 dígitos de tu app de autenticación.</p>
        <input className="input text-center text-2xl tracking-widest" inputMode="numeric" maxLength={6}
          value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        {error && <p className="text-neg text-sm" role="alert">{error}</p>}
        <button className="btn w-full">Verificar</button>
      </form>
    </div>
  )
}
