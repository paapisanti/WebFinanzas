import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCategories } from '../lib/hooks'
import { fmtDate, money, today, ymd } from '../lib/format'

const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)

export default function Alerts() {
  const categories = useCategories().data ?? []
  const month = ymd(new Date()).slice(0, 8) + '01'

  const budgets = useQuery({
    queryKey: ['alerts-budgets', month],
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_progress').select('*').eq('month', month)
      if (error) throw error
      return (data as any[]).map((r) => ({ ...r, budget: Number(r.budget), spent: Number(r.spent), pct: (Number(r.spent) / Number(r.budget)) * 100 }))
        .filter((r) => r.pct >= Math.min(...(r.alert_thresholds as number[]))).sort((a, b) => b.pct - a.pct)
    },
  })
  const subs = useQuery({
    queryKey: ['alerts-subs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('id,name,amount,next_charge_date').eq('status', 'activa').order('next_charge_date')
      if (error) throw error
      return (data as any[]).filter((s) => daysUntil(s.next_charge_date) <= 7)
    },
  })

  const b = budgets.data ?? []
  const s = subs.data ?? []
  if (b.length === 0 && s.length === 0) return null

  return (
    <div className="card space-y-3">
      {b.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-1"><h2 className="text-white font-semibold">Presupuestos</h2><Link to="/presupuestos" className="text-sm text-brass">Ver todos</Link></div>
          <ul className="text-sm space-y-1">
            {b.slice(0, 4).map((r) => (
              <li key={r.id} className="flex justify-between">
                <span>{r.category_id ? categories.find((c) => c.id === r.category_id)?.name ?? 'Categoría' : 'Presupuesto general'}</span>
                <span className={r.pct >= 100 ? 'text-neg' : 'text-brass'}>{r.pct.toFixed(0)} % · {money(r.spent)} de {money(r.budget)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-1"><h2 className="text-white font-semibold">Cobros próximos o pendientes</h2><Link to="/suscripciones" className="text-sm text-brass">Ver todas</Link></div>
          <ul className="text-sm space-y-1">
            {s.map((x) => (
              <li key={x.id} className="flex justify-between"><span>{x.name} · {fmtDate(x.next_charge_date)}</span><span className="text-white">{money(x.amount)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
