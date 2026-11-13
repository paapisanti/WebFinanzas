import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useInvestments } from '../lib/investments'
import { fmtDate, money, today } from '../lib/format'

const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)

// Avisos del Resumen: actualización mensual de inversiones pendiente y cobros próximos
export default function Alerts() {
  const inv = useInvestments()
  const subs = useQuery({
    queryKey: ['alerts-subs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('id,name,amount,next_charge_date').eq('status', 'activa').order('next_charge_date')
      if (error) throw error
      return (data as any[]).filter((s) => daysUntil(s.next_charge_date) <= 7)
    },
  })
  const pendingInv = !inv.isLoading && inv.pending
  const s = subs.data ?? []
  if (!pendingInv && s.length === 0) return null

  return (
    <div className="card space-y-3">
      {pendingInv && (
        <div className="flex justify-between items-center gap-3">
          <span className="text-sm">Toca actualizar la rentabilidad de tus inversiones del mes pasado.</span>
          <Link to="/inversiones" className="text-sm text-brass whitespace-nowrap">Actualizar</Link>
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
