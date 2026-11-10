-- Personal Finance Manager: esquema completo (todas las fases)
create extension if not exists pgcrypto;

create type account_type  as enum ('corriente','remunerada','efectivo','inversion');
create type category_kind as enum ('ingreso','gasto');
create type tx_type       as enum ('ingreso','gasto','transferencia','ajuste');
create type tx_status     as enum ('activo','anulado');
create type asset_type    as enum ('accion','etf','fondo','bono');
create type op_type       as enum ('compra','venta');
create type freq_type     as enum ('semanal','mensual','trimestral','semestral','anual');
create type sub_status    as enum ('activa','cancelada');
create type liability_type as enum ('hipoteca','prestamo','otra');
create type re_type       as enum ('vivienda','local','otro');

-- ===== Núcleo =====
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entity text not null,
  name text not null,
  type account_type not null,
  description text,
  initial_balance numeric(14,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references categories on delete set null,
  name text not null,
  kind category_kind not null,
  icon text,
  color text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  category_id uuid references categories,
  amount numeric(14,2) not null check (amount > 0),
  frequency freq_type not null,
  start_date date not null default current_date,
  next_charge_date date not null,
  account_id uuid references accounts,
  status sub_status not null default 'activa',
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type tx_type not null,
  amount numeric(14,2) not null,
  date date not null default current_date,
  account_id uuid not null references accounts,
  dest_account_id uuid references accounts,
  category_id uuid references categories,
  description text,
  status tx_status not null default 'activo',
  subscription_id uuid references subscriptions,
  source text not null default 'app',
  created_at timestamptz not null default now(),
  constraint amount_sign check ((type = 'ajuste' and amount <> 0) or (type <> 'ajuste' and amount > 0)),
  constraint transfer_dest check (
    (type = 'transferencia' and dest_account_id is not null and dest_account_id <> account_id)
    or (type <> 'transferencia' and dest_account_id is null))
);
create index on transactions (user_id, date desc);
create index on transactions (account_id);
create index on transactions (category_id);

create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  unique (user_id, name)
);
create table transaction_tags (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  transaction_id uuid not null references transactions on delete cascade,
  tag_id uuid not null references tags on delete cascade,
  primary key (transaction_id, tag_id)
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  category_id uuid references categories on delete cascade,  -- null = presupuesto general
  amount numeric(14,2) not null check (amount > 0),
  alert_thresholds int[] not null default '{75,90,100}'
);
create unique index budgets_unique on budgets (user_id, month, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ===== Inversión =====
create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  isin text,
  type asset_type not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table investment_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  asset_id uuid not null references assets,
  type op_type not null,
  date date not null default current_date,
  quantity numeric(18,6) not null check (quantity > 0),
  unit_price numeric(18,6) not null check (unit_price >= 0),
  fees numeric(14,2) not null default 0,
  account_id uuid not null references accounts,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table asset_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  asset_id uuid not null references assets on delete cascade,
  date date not null default current_date,
  price numeric(18,6) not null,
  unique (asset_id, date)
);

-- ===== Patrimonio =====
create table real_estate (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  type re_type not null default 'vivienda',
  purchase_price numeric(14,2),
  purchase_date date,
  archived boolean not null default false
);
create table real_estate_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  real_estate_id uuid not null references real_estate on delete cascade,
  date date not null default current_date,
  value numeric(14,2) not null,
  unique (real_estate_id, date)
);
create table liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  type liability_type not null,
  archived boolean not null default false
);
create table liability_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  liability_id uuid not null references liabilities on delete cascade,
  date date not null default current_date,
  balance numeric(14,2) not null check (balance >= 0),
  unique (liability_id, date)
);
create table net_worth_snapshots (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  bank numeric(14,2) not null default 0,
  cash numeric(14,2) not null default 0,
  investments numeric(14,2) not null default 0,
  real_estate numeric(14,2) not null default 0,
  liabilities numeric(14,2) not null default 0,
  assets_total numeric(14,2) generated always as (bank + cash + investments + real_estate) stored,
  net_worth numeric(14,2) generated always as (bank + cash + investments + real_estate - liabilities) stored,
  primary key (user_id, date)
);

create table settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  default_account_id uuid references accounts on delete set null,
  alert_thresholds int[] not null default '{75,90,100}'
);

-- ===== RLS: cada tabla solo accesible por su dueño =====
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','subscriptions','transactions','tags','transaction_tags',
    'budgets','assets','investment_operations','asset_prices','real_estate','real_estate_valuations',
    'liabilities','liability_balances','net_worth_snapshots','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ===== Cálculo de saldos (nunca almacenados) =====
-- Las compras/ventas de inversión mueven el efectivo de la cuenta de inversión
-- directamente aquí, sin crear transacciones: así no ensucian los informes de gasto.
create function account_balance_at(p_account uuid, p_date date)
returns numeric language sql stable as $$
  select a.initial_balance
    + coalesce((select sum(case
        when t.type = 'transferencia' and t.dest_account_id = a.id then t.amount
        when t.type = 'transferencia' or t.type = 'gasto' then -t.amount
        else t.amount end)
      from transactions t
      where t.status = 'activo' and t.date <= p_date and (t.account_id = a.id or t.dest_account_id = a.id)), 0)
    + coalesce((select sum(case when o.type = 'compra' then -(o.quantity * o.unit_price + o.fees)
                                else o.quantity * o.unit_price - o.fees end)
      from investment_operations o
      where o.account_id = a.id and o.date <= p_date and o.deleted_at is null), 0)
  from accounts a where a.id = p_account
$$;

create view account_balances with (security_invoker = true) as
  select id as account_id, user_id, account_balance_at(id, current_date) as balance
  from accounts where deleted_at is null;

-- Ingresos/gastos mensuales (las transferencias y ajustes no cuentan)
create view monthly_flow with (security_invoker = true) as
  select user_id, date_trunc('month', date)::date as month,
         coalesce(sum(amount) filter (where type = 'ingreso'), 0) as income,
         coalesce(sum(amount) filter (where type = 'gasto'), 0) as expense
  from transactions where status = 'activo' group by 1, 2;

-- Gasto por categoría principal (las subcategorías suman en su padre)
create view monthly_category_spend with (security_invoker = true) as
  select t.user_id, date_trunc('month', t.date)::date as month,
         top.id as category_id, coalesce(top.name, 'Sin categoría') as category, top.color,
         sum(t.amount) as spent
  from transactions t
  left join categories c on c.id = t.category_id
  left join categories top on top.id = coalesce(c.parent_id, c.id)
  where t.status = 'activo' and t.type = 'gasto'
  group by 1, 2, 3, 4, 5;

create view budget_progress with (security_invoker = true) as
  select b.id, b.user_id, b.month, b.category_id, b.amount as budget, b.alert_thresholds,
    coalesce((select sum(t.amount) from transactions t
      left join categories c on c.id = t.category_id
      where t.user_id = b.user_id and t.status = 'activo' and t.type = 'gasto'
        and date_trunc('month', t.date)::date = b.month
        and (b.category_id is null or c.id = b.category_id or c.parent_id = b.category_id)), 0) as spent
  from budgets b;

-- Posiciones de cartera (coste medio ponderado)
create view asset_positions with (security_invoker = true) as
  select a.id as asset_id, a.user_id, a.name, a.isin, a.type,
    q.qty as quantity,
    case when q.bought_qty > 0 then q.qty * q.bought_cost / q.bought_qty else 0 end as cost_basis,
    px.price as last_price,
    q.qty * coalesce(px.price, q.last_op_price) as market_value,
    q.first_buy as first_purchase_date
  from assets a
  cross join lateral (
    select coalesce(sum(case when o.type='compra' then o.quantity else -o.quantity end), 0) as qty,
           coalesce(sum(o.quantity) filter (where o.type='compra'), 0) as bought_qty,
           coalesce(sum(o.quantity*o.unit_price + o.fees) filter (where o.type='compra'), 0) as bought_cost,
           min(o.date) filter (where o.type='compra') as first_buy,
           (array_agg(o.unit_price order by o.date desc, o.created_at desc))[1] as last_op_price
    from investment_operations o where o.asset_id = a.id and o.deleted_at is null) q
  left join lateral (
    select p.price from asset_prices p where p.asset_id = a.id order by p.date desc limit 1) px on true
  where a.deleted_at is null;

-- ===== Patrimonio: snapshots =====
create function take_snapshot(p_user uuid default auth.uid(), p_date date default current_date)
returns net_worth_snapshots language plpgsql security definer set search_path = public as $$
declare r net_worth_snapshots;
begin
  if auth.uid() is not null and p_user <> auth.uid() then raise exception 'forbidden'; end if;
  insert into net_worth_snapshots (user_id, date, bank, cash, investments, real_estate, liabilities)
  select p_user, p_date,
    coalesce((select sum(account_balance_at(id, p_date)) from accounts where user_id = p_user and deleted_at is null and type <> 'efectivo'), 0),
    coalesce((select sum(account_balance_at(id, p_date)) from accounts where user_id = p_user and deleted_at is null and type = 'efectivo'), 0),
    coalesce((select sum(s.q * coalesce(s.px, s.lastop)) from (
      select (select coalesce(sum(case when o.type='compra' then o.quantity else -o.quantity end),0)
                from investment_operations o where o.asset_id = a.id and o.date <= p_date and o.deleted_at is null) q,
             (select p.price from asset_prices p where p.asset_id = a.id and p.date <= p_date order by p.date desc limit 1) px,
             (select o.unit_price from investment_operations o where o.asset_id = a.id and o.date <= p_date and o.deleted_at is null
                order by o.date desc, o.created_at desc limit 1) lastop
      from assets a where a.user_id = p_user and a.deleted_at is null) s), 0),
    coalesce((select sum(coalesce(
        (select v.value from real_estate_valuations v where v.real_estate_id = re.id and v.date <= p_date order by v.date desc limit 1),
        case when re.purchase_date <= p_date then re.purchase_price end, 0))
      from real_estate re where re.user_id = p_user and not re.archived), 0),
    coalesce((select sum(coalesce(
        (select b.balance from liability_balances b where b.liability_id = l.id and b.date <= p_date order by b.date desc limit 1), 0))
      from liabilities l where l.user_id = p_user and not l.archived), 0)
  on conflict (user_id, date) do update set bank = excluded.bank, cash = excluded.cash,
    investments = excluded.investments, real_estate = excluded.real_estate, liabilities = excluded.liabilities
  returning * into r;
  return r;
end $$;

-- Reconstruye el histórico (fin de cada mes desde p_from) tras editar movimientos antiguos
create function rebuild_snapshots(p_from date default null)
returns int language plpgsql security definer set search_path = public as $$
declare d date; n int := 0; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'auth required'; end if;
  d := (date_trunc('month', coalesce(p_from, (select min(date) from transactions where user_id = uid), current_date)) + interval '1 month - 1 day')::date;
  while d < current_date loop
    perform take_snapshot(uid, d); n := n + 1;
    d := (date_trunc('month', d + 1) + interval '1 month - 1 day')::date;
  end loop;
  perform take_snapshot(uid, current_date);
  return n + 1;
end $$;

create function snapshot_all_users() returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select id from auth.users loop perform take_snapshot(u, current_date); end loop;
end $$;
revoke execute on function snapshot_all_users() from public, anon, authenticated;

-- ===== Suscripciones: confirmar cobro crea el movimiento real =====
create function confirm_subscription_charge(p_sub uuid, p_date date default null)
returns transactions language plpgsql as $$
declare s subscriptions; tx transactions; d date;
begin
  select * into s from subscriptions where id = p_sub and status = 'activa';
  if not found then raise exception 'suscripción no encontrada o cancelada'; end if;
  d := coalesce(p_date, s.next_charge_date);
  insert into transactions (type, amount, date, account_id, category_id, description, subscription_id)
  values ('gasto', s.amount, d, s.account_id, s.category_id, s.name, s.id) returning * into tx;
  update subscriptions set next_charge_date = case frequency
    when 'semanal' then next_charge_date + 7
    when 'mensual' then (next_charge_date + interval '1 month')::date
    when 'trimestral' then (next_charge_date + interval '3 months')::date
    when 'semestral' then (next_charge_date + interval '6 months')::date
    else (next_charge_date + interval '1 year')::date end
  where id = s.id;
  return tx;
end $$;

-- ===== Inicialización del usuario (idempotente): categorías por defecto y ajustes =====
create function init_user() returns void language plpgsql as $$
declare n text; i int := 0;
  pal text[] := array['#E0B25A','#6FCF9F','#7FB2F0','#EF8A7C','#B79CED','#F0A36B','#5EC8D4','#D98BB5','#A3C76B','#8FA0C0','#E6C86E','#78C0A8','#C9877A','#9AA5B8'];
begin
  insert into settings (user_id) values (auth.uid()) on conflict do nothing;
  if exists (select 1 from categories where user_id = auth.uid()) then return; end if;
  foreach n in array array['Nómina','Ingresos extraordinarios','Otros ingresos'] loop
    i := i + 1; insert into categories (name, kind, color, sort) values (n, 'ingreso', pal[i], i);
  end loop;
  i := 0;
  foreach n in array array['Vivienda','Alimentación','Transporte','Restaurantes','Ocio','Viajes','Salud','Educación',
    'Seguros','Tecnología','Compras','Suscripciones','Impuestos','Otros gastos'] loop
    i := i + 1; insert into categories (name, kind, color, sort) values (n, 'gasto', pal[i], i);
  end loop;
end $$;

-- ===== Snapshot diario (si falla, activa pg_cron en Supabase > Database > Extensions y repite) =====
create extension if not exists pg_cron;
select cron.schedule('net-worth-snapshot', '5 0 * * *', $$select public.snapshot_all_users()$$);
