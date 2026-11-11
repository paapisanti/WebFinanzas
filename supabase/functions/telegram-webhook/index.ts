// Bot de Telegram para apuntar gastos e ingresos desde el chat.
//   12,5 café            -> gasto
//   +1200 nómina         -> ingreso
//   5 café @efectivo     -> en otra cuenta (nombre o entidad)
//   ayer 20 cena         -> con fecha de ayer
// Comandos: /saldo  /mes  /deshacer  /ayuda
// Solo responde a tu chat (TELEGRAM_CHAT_ID) y exige el secreto del webhook.
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''
const CHAT = Number(Deno.env.get('TELEGRAM_CHAT_ID') ?? 0)
const USER = Deno.env.get('OWNER_USER_ID') ?? ''

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const todayMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const dayBefore = (d: string) => new Date(new Date(d + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10)

// Palabras clave -> categoría (edítalas a tu gusto)
const KEYWORDS: Record<string, string[]> = {
  'Alimentación': ['super', 'supermercado', 'mercadona', 'carrefour', 'lidl', 'dia', 'compra', 'fruta', 'panaderia'],
  'Restaurantes': ['cafe', 'restaurante', 'cena', 'comida', 'bar', 'cerveza', 'desayuno', 'menu', 'pizza', 'cana'],
  'Transporte': ['gasolina', 'metro', 'bus', 'taxi', 'uber', 'cabify', 'parking', 'tren', 'peaje', 'renfe'],
  'Suscripciones': ['netflix', 'spotify', 'hbo', 'disney', 'prime', 'youtube', 'icloud'],
  'Ocio': ['cine', 'concierto', 'juego', 'copas', 'teatro'],
  'Salud': ['farmacia', 'medico', 'dentista', 'gimnasio', 'gym'],
  'Vivienda': ['alquiler', 'luz', 'agua', 'gas', 'internet', 'comunidad'],
  'Compras': ['ropa', 'amazon', 'zapatillas'],
  'Nómina': ['nomina', 'salario', 'sueldo'],
}

export interface Acc { id: string; name: string; entity: string }
export interface Cat { id: string; name: string; kind: string; parent_id: string | null }
export type Parsed =
  | { ok: true; kind: 'ingreso' | 'gasto'; amount: number; desc: string; category?: Cat; account?: Acc; date: string }
  | { ok: false; error: string }

export function parseEntry(text: string, cats: Cat[], accs: Acc[], today: string): Parsed {
  let s = text.trim()
  let date = today
  if (/^ayer\b/i.test(s)) { date = dayBefore(today); s = s.replace(/^ayer\b\s*/i, '') }
  const m = s.match(/^([+-]?)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)?\s*(.*)$/is)
  if (!m) return { ok: false, error: 'No te he entendido. Prueba con "12,5 café" o escribe /ayuda.' }
  const kind = m[1] === '+' ? 'ingreso' : 'gasto'
  const amount = Number(m[2].replace(',', '.'))
  if (!(amount > 0)) return { ok: false, error: 'El importe debe ser mayor que cero.' }
  let rest = m[3]

  let account: Acc | undefined
  const at = rest.match(/@(\S+)/)
  if (at) {
    const t = norm(at[1])
    account = accs.find((a) => norm(a.name).includes(t) || norm(a.entity).includes(t))
    if (!account) return { ok: false, error: `No encuentro ninguna cuenta que se parezca a "${at[1]}". Escribe /saldo para ver tus cuentas.` }
    rest = rest.replace(at[0], '')
  }
  const desc = rest.replace(/\s+/g, ' ').trim()

  const pool = cats.filter((c) => c.kind === kind)
  const n = norm(desc)
  let category = pool.find((c) => n.includes(norm(c.name)))
  if (!category) {
    const words = n.split(/[^a-z0-9ñ]+/)
    for (const [name, list] of Object.entries(KEYWORDS)) {
      if (list.some((w) => words.includes(w))) { category = pool.find((c) => c.name === name); if (category) break }
    }
  }
  category ??= pool.find((c) => c.name === (kind === 'ingreso' ? 'Otros ingresos' : 'Otros gastos'))
  return { ok: true, kind, amount, desc, category, account, date }
}

async function send(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

// Avisa si este gasto hace cruzar un umbral de algún presupuesto (general o de su categoría)
async function budgetWarnings(cat: Cat | undefined, amount: number, date: string, cats: Cat[]): Promise<string[]> {
  const { data } = await sb.from('budget_progress').select('*').eq('user_id', USER).eq('month', date.slice(0, 7) + '-01')
  const out: string[] = []
  for (const r of (data ?? []) as any[]) {
    if (r.category_id !== null && r.category_id !== cat?.id && r.category_id !== cat?.parent_id) continue
    const budget = Number(r.budget), spent = Number(r.spent)
    const before = ((spent - amount) / budget) * 100, after = (spent / budget) * 100
    const crossed = (r.alert_thresholds as number[]).filter((t) => before < t && after >= t).pop()
    if (crossed === undefined) continue
    const name = r.category_id ? cats.find((c) => c.id === r.category_id)?.name ?? 'categoría' : 'general'
    out.push(`Aviso, presupuesto ${name}: llevas el ${after.toFixed(0)} % (${eur(spent)} de ${eur(budget)}).`)
  }
  return out
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 })
  const update = await req.json().catch(() => null)
  const msg = update?.message
  if (!msg?.text) return new Response('ok')

  // Configuración inicial: cualquier chat puede pedir su id con /start, pero solo el tuyo puede hacer nada más
  if (msg.chat.id !== CHAT) {
    if (String(msg.text).startsWith('/start')) await send(msg.chat.id, `Tu chat id es ${msg.chat.id}. Guárdalo en el secreto TELEGRAM_CHAT_ID de Supabase.`)
    return new Response('ok')
  }
  const text: string = msg.text.trim()

  try {
    if (/^\/(start|ayuda)\b/.test(text)) {
      await send(CHAT, 'Escribe:\n"12,5 café" para un gasto\n"+1200 nómina" para un ingreso\n"5 café @efectivo" para otra cuenta\n"ayer 20 cena" para otra fecha\n\n/saldo — saldo de tus cuentas\n/mes — resumen del mes\n/deshacer — anula el último movimiento enviado por aquí')
    } else if (/^\/saldo\b/.test(text)) {
      const { data: accs } = await sb.from('accounts').select('id,entity,name,archived').eq('user_id', USER).is('deleted_at', null).order('created_at')
      const { data: bal } = await sb.from('account_balances').select('account_id,balance').eq('user_id', USER)
      const m = new Map((bal ?? []).map((b: any) => [b.account_id, Number(b.balance)]))
      const rows = (accs ?? []).filter((a: any) => !a.archived)
      const total = rows.reduce((s: number, a: any) => s + (m.get(a.id) ?? 0), 0)
      await send(CHAT, rows.map((a: any) => `${a.entity} · ${a.name}: ${eur(m.get(a.id) ?? 0)}`).join('\n') + `\n\nTotal: ${eur(total)}`)
    } else if (/^\/mes\b/.test(text)) {
      const month = todayMadrid().slice(0, 7) + '-01'
      const { data: f } = await sb.from('monthly_flow').select('income,expense').eq('user_id', USER).eq('month', month).maybeSingle()
      const { data: cs } = await sb.from('monthly_category_spend').select('category,spent').eq('user_id', USER).eq('month', month).order('spent', { ascending: false }).limit(3)
      const inc = Number(f?.income ?? 0), exp = Number(f?.expense ?? 0)
      const top = (cs ?? []).map((c: any) => `  ${c.category}: ${eur(Number(c.spent))}`).join('\n')
      await send(CHAT, `Este mes\nIngresos: ${eur(inc)}\nGastos: ${eur(exp)}\nAhorro: ${eur(inc - exp)}${top ? `\n\nMayores gastos:\n${top}` : ''}`)
    } else if (/^\/deshacer\b/.test(text)) {
      const { data } = await sb.from('transactions').select('id,amount,description').eq('user_id', USER)
        .eq('source', 'telegram').eq('status', 'activo').order('created_at', { ascending: false }).limit(1)
      if (!data?.length) { await send(CHAT, 'No hay nada que deshacer.'); return new Response('ok') }
      await sb.from('transactions').update({ status: 'anulado' }).eq('id', data[0].id)
      await send(CHAT, `Anulado: ${eur(data[0].amount)} ${data[0].description ?? ''}`.trim())
    } else {
      const { data: cats } = await sb.from('categories').select('id,name,kind,parent_id').eq('user_id', USER).eq('active', true)
      const { data: accs } = await sb.from('accounts').select('id,name,entity').eq('user_id', USER).eq('archived', false).is('deleted_at', null).order('created_at')
      const p = parseEntry(text, (cats ?? []) as Cat[], (accs ?? []) as Acc[], todayMadrid())
      if (!p.ok) { await send(CHAT, p.error); return new Response('ok') }

      let account = p.account
      if (!account) {
        const { data: st } = await sb.from('settings').select('default_account_id').eq('user_id', USER).maybeSingle()
        account = (accs ?? []).find((a: any) => a.id === st?.default_account_id) as Acc | undefined
        if (!account) {
          const { data: first } = await sb.from('accounts').select('id,name,entity,type').eq('user_id', USER).eq('archived', false).is('deleted_at', null).neq('type', 'inversion').order('created_at').limit(1)
          account = first?.[0] as Acc | undefined
        }
      }
      if (!account) { await send(CHAT, 'Crea primero una cuenta en la app.'); return new Response('ok') }

      const { error } = await sb.from('transactions').insert({
        user_id: USER, type: p.kind, amount: p.amount, date: p.date, account_id: account.id,
        category_id: p.category?.id ?? null, description: p.desc || null, source: 'telegram',
      })
      if (error) throw error
      const warns = p.kind === 'gasto' ? await budgetWarnings(p.category, p.amount, p.date, (cats ?? []) as Cat[]) : []
      await send(CHAT, [
        `${p.kind === 'ingreso' ? 'Ingreso' : 'Gasto'} guardado: ${eur(p.amount)} · ${p.category?.name ?? 'Sin categoría'} · ${account.name}${p.desc ? ` · ${p.desc}` : ''}${p.date !== todayMadrid() ? ` (${p.date})` : ''}`,
        ...warns,
      ].join('\n'))
    }
  } catch (e) {
    console.error(e)
    await send(CHAT, 'Ha ocurrido un error al guardar. Inténtalo de nuevo.')
  }
  return new Response('ok')
})
