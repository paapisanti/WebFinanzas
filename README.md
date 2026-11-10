# Personal Finance Manager

React + Vite PWA · Supabase (Postgres, Auth, Edge Functions) · Cloudflare Pages · Bot de Telegram.

## Puesta en marcha (≈20 min, una sola vez)

### 1. Supabase
1. Crea un proyecto en supabase.com (región UE).
2. **Authentication → Providers → Email**: desactiva *Allow new users to sign up*.
3. **Authentication → Users → Add user**: crea tu usuario (email + contraseña). Copia su **User UID**.
4. **Database → Extensions**: activa `pg_cron`.
5. **SQL Editor**: pega y ejecuta `supabase/migrations/0001_schema.sql`.
6. **Project Settings → API**: copia `Project URL` y la clave `anon public`.

### 2. GitHub + Cloudflare Pages
1. Crea un repo **privado** y sube esta carpeta.
2. En local: `cd apps/web && npm install` y haz commit de `package-lock.json`.
3. Cloudflare → Workers & Pages → Create → Pages → conecta el repo.
   - Root directory: `apps/web` · Build command: `npm run build` · Output: `dist`
   - Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Abre la URL en el móvil → menú del navegador → *Añadir a pantalla de inicio*.

### 3. Primer uso
Entra → Cuentas → crea tus cuentas con su saldo inicial → Ajustes → activa la verificación en dos pasos.

### 4. Secrets de GitHub (Settings → Secrets → Actions)
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
Con ellos, cada push que toque `supabase/` aplica migraciones y despliega las funciones; hay copia semanal y un ping diario que evita la pausa por inactividad.

### 5. Telegram (opcional)
1. En Telegram habla con **@BotFather** → `/newbot` → copia el token.
2. Secrets de la función (Supabase → Edge Functions → Secrets):
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (cadena aleatoria), `OWNER_USER_ID` (tu User UID), `TELEGRAM_CHAT_ID` (déjalo en 0 al principio).
3. Despliega (push a `main` o *Actions → Migraciones y funciones → Run*).
4. Registra el webhook (una vez, desde el navegador):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook&secret_token=<WEBHOOK_SECRET>`
5. Escribe `/start` al bot: te responde con tu chat id. Guárdalo en `TELEGRAM_CHAT_ID` y listo.

Uso: `12,5 café` · `+1200 nómina` · `/saldo` · `/deshacer`.

## Estado
- Hecho: esquema completo (todas las fases), auth + MFA, cuentas, movimientos (crear/editar/anular/duplicar/transferencias/ajustes), dashboard con filtros y gráficos, PWA, Telegram.
- Pendiente de UI (el esquema ya está listo): presupuestos, suscripciones, inversiones + TWR/XIRR, inmuebles y deudas, informes/exportaciones, análisis de cartera.
- Futuro: calendario económico diario (Edge Function programada + resumen por Telegram).
