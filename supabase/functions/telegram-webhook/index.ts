// Bot de Telegram: añade gastos/ingresos escribiendo "12,5 café" o "+1200 nómina".
// Comandos: /saldo, /deshacer, /start. Solo responde a tu chat (TELEGRAM_CHAT_ID).
import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!
const CHAT = Number(Deno.env.get('TELEGRAM_CHAT_ID') ?? 0)
const USER = Deno.env.get('OWNER_USER_ID')!

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

// Palabras clave -> categoría (editable)
const KEYWORDS: Record<string, string[]> = {
  'Alimentación': ['super', 'mercadona', 'carrefour', 'lidl', 'dia', 'compra', 'fruta'],
  'Restaurantes': ['cafe', 'restaurante', 'cena', 'comida', 'bar', 'cerveza', 'desayuno', 'menu'],
  'Transporte': ['gasolina', 'metro', 'bus', 'taxi', 'uber', 'cabify', 'parking', 'tren', 'peaje'],
  'Suscripciones': ['netflix', 'spotify', 'hbo', 'disney', 'prime', 'youtube', 'icloud'],
  'Ocio': ['cine', 'concierto', 'juego', 'copas'],
  'Salud': ['farmacia', 'medico', 'dentista', 'gimnasio'],
  'Vivienda': ['alquiler', 'luz', 'agua', 'gas', 'internet', 'comunidad'],
  'Compras': ['ropa', 'amazon', 'zapatillas'],
  'Nómina': ['nomina', 'salario', 'sueldo'],
}

async function send(text: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text }),
  })
}

Deno.serve(async (req) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 })
  const update = await req.json()
  const msg = update.message
  if (!msg?.text) return new Response('ok')
  if (msg.chat.id !== CHAT) {
    // Útil para la configuración inicial: te dice tu chat id
    if (msg.text.startsWith('/start')) {
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: msg.chat.id, text: `Tu chat id es ${msg.chat.id}. Guárdalo como TELEGRAM_CHAT_ID.` }),
      })
    }
    return new Response('ok')
  }
  const text: string = msg.text.trim()

  try {
    if (text.startsWith('/start') || text.startsWith('/ayuda')) {
      await send('Escribe "12,5 café" para un gasto o "+1200 nómina" para un ingreso.\n/saldo — saldo de tus cuentas\n/deshacer — anula el último movimiento enviado por aquí')
    } else if (text.startsWith('/saldo')) {
      const { data } = await sb.from('accounts').select('id,entity,name,type,archived').eq('user_id', USER).is('deleted_at', null)
      const { data: bal } = await sb.from('account_balances').select('account_id,balance').eq('user_id', USER)
      const m = new Map((bal ?? []).map((b) => [b.account_id, Number(b.balance)]))
      const rows = (data ?? []).filter((a) => !a.archived)
      const total = rows.reduce((s, a) => s + (m.get(a.id) ?? 0), 0)
      await send(rows.map((a) => `${a.entity} · ${a.name}: ${eur(m.get(a.id) ?? 0)}`).join('\n') + `\n\nTotal: ${eur(total)}`)
    } else if (text.startsWith('/deshacer')) {
      const { data } = await sb.from('transactions').select('id,amount,description').eq('user_id', USER)
        .eq('source', 'telegram').eq('status', 'activo').order('created_at', { ascending: false }).limit(1)
      if (!data?.length) { await send('No hay nada que deshacer.'); return new Response('ok') }
      await sb.from('transactions').update({ status: 'anulado' }).eq('id', data[0].id)
      await send(`Anulado: ${eur(data[0].amount)} ${data[0].description ?? ''}`)
    } else {
      const m = text.match(/^([+-]?)\s*(\d+(?:[.,]\d{1,2})?)\s*€?\s*(.*)$/s)
      if (!m) { await send('No te he entendido. Prueba con "12,5 café" o /ayuda.'); return new Response('ok') }
      const isIncome = m[1] === '+'
      const amount = Number(m[2].replace(',', '.'))
      const desc = m[3].trim()

      const { data: cats } = await sb.from('categories').select('id,name,kind').eq('user_id', USER).eq('active', true)
      const kind = isIncome ? 'ingreso' : 'gasto'
      const pool = (cats ?? []).filter((c) => c.kind === kind)
      const n = norm(desc)
      let cat = pool.find((c) => n.includes(norm(c.name)))
      if (!cat) {
        for (const [name, words] of Object.entries(KEYWORDS)) {
          if (words.some((w) => n.split(/\W+/).includes(w))) { cat = pool.find((c) => c.name === name); if (cat) break }
        }
      }
      cat ??= pool.find((c) => c.name === (isIncome ? 'Otros ingresos' : 'Otros gastos'))

      const { data: st } = await sb.from('settings').select('default_account_id').eq('user_id', USER).maybeSingle()
      let accountId = st?.default_account_id as string | null
      if (!accountId) {
        const { data: acc } = await sb.from('accounts').select('id').eq('user_id', USER).eq('archived', false)
          .is('deleted_at', null).neq('type', 'inversion').order('created_at').limit(1)
        accountId = acc?.[0]?.id ?? null
      }
      if (!accountId) { await send('Crea primero una cuenta en la app.'); return new Response('ok') }

      const { error } = await sb.from('transactions').insert({
        user_id: USER, type: kind, amount, account_id: accountId, category_id: cat?.id ?? null,
        description: desc || null, source: 'telegram',
      })
      if (error) throw error
      await send(`${isIncome ? 'Ingreso' : 'Gasto'} guardado: ${eur(amount)} · ${cat?.name ?? 'Sin categoría'}${desc ? ` · ${desc}` : ''}`)
    }
  } catch (e) {
    console.error(e)
    await send('Ha ocurrido un error al guardar. Inténtalo de nuevo.')
  }
  return new Response('ok')
})
