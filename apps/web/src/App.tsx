import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login, { MfaChallenge } from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Accounts from './pages/Accounts'
import Budgets from './pages/Budgets'
import Subscriptions from './pages/Subscriptions'
import Settings from './pages/Settings'
import QuickAdd from './components/QuickAdd'

const NAV = [
  { to: '/', label: 'Resumen', short: 'Resumen', end: true },
  { to: '/movimientos', label: 'Movimientos', short: 'Movim.' },
  { to: '/presupuestos', label: 'Presupuestos', short: 'Presup.' },
  { to: '/suscripciones', label: 'Suscripciones', short: 'Suscr.' },
  { to: '/cuentas', label: 'Cuentas', short: 'Cuentas' },
  { to: '/ajustes', label: 'Ajustes', short: 'Ajustes' },
]

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [mfaPending, setMfaPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setReady(false); return }
    ;(async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') { setMfaPending(true); return }
      setMfaPending(false)
      await supabase.rpc('init_user')
      setReady(true)
    })()
  }, [session])

  if (session === undefined) return <div className="p-8 text-mute">Cargando…</div>
  if (!session) return <Login />
  if (mfaPending) return <MfaChallenge onDone={() => setSession({ ...session })} />
  if (!ready) return <div className="p-8 text-mute">Preparando tus datos…</div>

  return (
    <div className="h-full flex flex-col md:flex-row">
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r border-line p-4">
        <div className="text-white font-bold text-lg mb-6 px-3">Finanzas</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `px-3 py-2 rounded-lg ${isActive ? 'bg-raise text-white' : 'text-mute hover:text-soft'}`}>
            {n.label}
          </NavLink>
        ))}
        <button className="btn mt-4" onClick={() => setAdding(true)}>+ Movimiento</button>
      </aside>

      <main className="flex-1 overflow-y-auto pb-28 md:pb-8">
        <div className="max-w-5xl mx-auto p-4 md:p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/movimientos" element={<Transactions />} />
            <Route path="/presupuestos" element={<Budgets />} />
            <Route path="/suscripciones" element={<Subscriptions />} />
            <Route path="/cuentas" element={<Accounts />} />
            <Route path="/ajustes" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <button onClick={() => setAdding(true)} aria-label="Añadir movimiento"
        className="md:hidden fixed right-4 bottom-20 z-20 h-14 w-14 rounded-full bg-brass text-ink text-3xl font-semibold shadow-lg">+</button>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-panel border-t border-line grid grid-cols-6"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `py-3.5 text-center text-xs ${isActive ? 'text-brass font-semibold' : 'text-mute'}`}>
            {n.short}
          </NavLink>
        ))}
      </nav>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </div>
  )
}
