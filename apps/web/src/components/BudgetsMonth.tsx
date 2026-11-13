import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCategories } from '../lib/hooks'
import { money, ymd } from '../lib/format'

const barColor = (pct: number, th: number[]) => {
  const [a = 75, b = 90, c = 100] = th
  return pct >= c ? 'bg-neg' : pct >= b ? 'bg-[#F0A36B]' : pct >= a ? 'bg-brass' : 'bg-pos'
}

export default function BudgetsMonth() {
  const categories = useCategories().data ?? []
  const month = ymd(new Date()).slice(0, 8) + '01'
  const monthName = new Date().toLocaleDateString('es-ES', { month: 'long' })
  const q = useQuery({
    queryKey: ['budgets-summary', month],
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_progress').select('*').eq('month', month)
      if (error) throw error
      return (data as any[]).map((r) => ({ id: r.id as string, category_id: r.category_id as string | null, budget: Number(r.budget), spent: Number(r.spent), th: r.alert_thresholds as number[] }))
        .sort((a, b) => (a.category_id === null ? -1 : b.category_id === null ? 1 : b.spent / b.budget - a.spent / a.budget))
    },
  })
  const rows = q.data ?? []

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Presupuestos de {monthName}</h2>
        <Link to="/presupuestos" className="text-sm text-brass">Ver todos</Link>
      </div>
      {!q.isLoading && rows.length === 0 && <p className="text-sm text-mute">No tienes presupuestos este mes. <Link to="/presupuestos" className="text-brass">Crear uno</Link></p>}
      <ul className="space-y-3">
        {rows.map((r) => {
          const pct = (r.spent / r.budget) * 100
          const left = r.budget - r.spent
          return (
            <li key={r.id} className="space-y-1">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-white truncate">{r.category_id ? categories.find((c) => c.id === r.category_id)?.name ?? 'Categoría' : 'Presupuesto general'}</span>
                <span className="text-mute whitespace-nowrap">{money(r.spent)} de {money(r.budget)}</span>
              </div>
              <div className="h-2 rounded-full bg-raise overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <div className={`h-full ${barColor(pct, r.th)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className={`text-xs ${pct >= 100 ? 'text-neg' : 'text-mute'}`}>{pct.toFixed(0)} % · {left >= 0 ? `quedan ${money(left)}` : `te has pasado ${money(-left)}`}</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
