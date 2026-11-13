import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login, { MfaChallenge } from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'
import Investments from './pages/Investments'
import Subscriptions from './pages/Subscriptions'
import Accounts from './pages/Accounts'
import Settings from './pages/Settings'
import Patrimonio from './pages/Patrimonio'
import { useAdvanced } from './lib/hooks'
import QuickAdd from './components/QuickAdd'

const NAV = [
  { to: '/', label: 'Resumen', short: 'Resumen', end: true, primary: true },
  { to: '/movimientos', label: 'Movimientos', short: 'Movim.', primary: true },
  { to: '/presupuestos', label: 'Presupuestos', short: 'Presup.', primary: true },
  { to: '/inversiones', label: 'Inversiones', short: 'Inversión', primary: true },
  { to: '/suscripciones', label: 'Suscripciones', short: 'Suscripciones' },
  { to: '/patrimonio', label: 'Patrimonio', short: 'Patrimonio', adv: true },
  { to: '/cuentas', label: 'Cuentas', short: 'Cuentas' },
  { to: '/ajustes', label: 'Ajustes', short: 'Ajustes' },
]

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [mfaPending, setMfaPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [adding, setAdding] = useState(false)
  const [more, setMore] = useState(false)
  const loc = useLocation()
  const advanced = useAdvanced(ready).data ?? false

  useEffect(() => { setMore(false) }, [loc.pathname])

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

  const items = NAV.filter((n) => !n.adv || advanced)
  const primary = items.filter((n) => n.primary)
  const secondary = items.filter((n) => !n.primary)
  const inMore = secondary.some((n) => loc.pathname.startsWith(n.to))

  return (
    <div className="h-full flex flex-col md:flex-row">
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r border-line p-4">
        <div className="text-white font-bold text-lg mb-6 px-3">Finanzas</div>
        {items.map((n) => (
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
            <Route path="/inversiones" element={<Investments />} />
            <Route path="/suscripciones" element={<Subscriptions />} />
            <Route path="/patrimonio" element={advanced ? <Patrimonio /> : <Navigate to="/" replace />} />
            <Route path="/cuentas" element={<Accounts />} />
            <Route path="/ajustes" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <button onClick={() => setAdding(true)} aria-label="Añadir movimiento"
        className="md:hidden fixed right-4 bottom-20 z-20 h-14 w-14 rounded-full bg-brass text-ink text-3xl font-semibold shadow-lg">+</button>

      {more && (
        <div className="md:hidden fixed inset-0 z-10" onClick={() => setMore(false)}>
          <div className="absolute right-2 bottom-16 bg-panel border border-line rounded-xl p-2 w-48 shadow-lg" onClick={(e) => e.stopPropagation()}>
            {secondary.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `block px-3 py-3 rounded-lg ${isActive ? 'bg-raise text-white' : 'text-soft'}`}>{n.label}</NavLink>
            ))}
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-panel border-t border-line grid grid-cols-5"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {primary.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `py-3.5 text-center text-xs ${isActive ? 'text-brass font-semibold' : 'text-mute'}`}>
            {n.short}
          </NavLink>
        ))}
        <button onClick={() => setMore(!more)} aria-expanded={more}
          className={`py-3.5 text-center text-xs ${inMore || more ? 'text-brass font-semibold' : 'text-mute'}`}>Más</button>
      </nav>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </div>
  )
}
