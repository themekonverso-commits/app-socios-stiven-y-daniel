-- ═══════════════════════════════════════════════════════════════════════════
-- Dashboard Socios — Esquema inicial (Fase 0)
--
-- Negocio: tienda Shopify con dropshipping operada por DOS socios al 50 %.
-- Uno adelanta la inversión publicitaria, el otro lleva la parte técnica.
--
-- Este archivo es autocontenido y se ejecuta de una sola pasada. También es
-- idempotente: volver a ejecutarlo no rompe nada ni duplica las semillas.
--
-- Ejecutar como rol `postgres` desde el SQL Editor de Supabase (hace falta
-- para crear el trigger sobre auth.users).
--
-- SEGURIDAD — leer antes de tocar nada:
--   · RLS activado en TODAS las tablas, sin excepción.
--   · Políticas SEPARADAS de SELECT / INSERT / UPDATE / DELETE. Nunca FOR ALL.
--   · Ninguna política concede acceso al rol `anon`: todas son `to authenticated`
--     y además se revocan los privilegios de `anon` sobre cada tabla.
--   · NINGUNA clave de API vive en la base de datos. Ni aquí ni en el futuro.
--     Van en variables de entorno de Vercel. La tabla `integraciones` guarda
--     solo identificadores de cuenta, jamás secretos.
--   · La tabla `cuentas_activos` es un INVENTARIO de cuentas, NO una bóveda de
--     credenciales: no tiene campo de contraseña y no se le debe añadir.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 profiles — un perfil por socio, espejo de auth.users
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  nombre      text not null,
  color       text default '#F2551E',
  activo      boolean not null default true,
  created_at  timestamptz default now()
);

comment on table public.profiles is
  'Un perfil por socio. Se crea automáticamente al dar de alta el usuario en auth.users.';
comment on column public.profiles.activo is
  'Un socio inactivo pierde todo acceso: es_socio_activo() devuelve false.';


-- 1.2 categorias — catálogo de ingresos y gastos, ampliable por el usuario
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        text not null check (tipo in ('ingreso', 'gasto')),
  es_sistema  boolean not null default false,
  orden       int default 100,
  created_at  timestamptz default now(),
  unique (nombre, tipo)
);

comment on column public.categorias.es_sistema is
  'true = categoría semilla. No se puede borrar (lo impide la política de DELETE). '
  'Las que crea el usuario desde el formulario de movimiento llevan false y sí se '
  'pueden borrar, siempre que ninguna fila de movimientos las referencie: lo impide '
  'la clave foránea movimientos.categoria_id.';


-- 1.3 tipos_cambio — tasa diaria USD → EUR
create table if not exists public.tipos_cambio (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  divisa      text not null check (divisa in ('USD')),
  tasa_a_eur  numeric(12, 6) not null,
  created_at  timestamptz default now(),
  unique (fecha, divisa)
);

comment on column public.tipos_cambio.tasa_a_eur is '1 USD = X EUR';


-- 1.4 movimientos — ingresos y gastos, el corazón del sistema
create table if not exists public.movimientos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('ingreso', 'gasto')),
  fecha           date not null,
  concepto        text not null,
  categoria_id    uuid not null references public.categorias (id),

  -- Importes en divisa original
  divisa          text not null default 'EUR' check (divisa in ('EUR', 'USD')),
  base_imponible  numeric(12, 2) not null,
  iva_tipo        numeric(5, 2) not null default 21,
  iva_importe     numeric(12, 2) not null default 0,
  total           numeric(12, 2) not null,

  -- Conversión a EUR (divisa de reporte)
  tasa_cambio     numeric(12, 6) not null default 1,
  total_eur       numeric(12, 2) not null,
  base_eur        numeric(12, 2) not null,

  -- Reparto entre socios
  anticipado_por  uuid references public.profiles (id),
  reembolsado     boolean not null default false,
  fecha_reembolso date,

  -- Campos opcionales según el tipo de movimiento
  num_pedidos     int,
  plataforma      text,
  impresiones     bigint,
  clicks          int,

  notas           text,
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

comment on column public.movimientos.iva_tipo is
  'Porcentaje de IVA español: 21, 10, 4 o 0.';
comment on column public.movimientos.anticipado_por is
  'Socio que puso el dinero de su bolsillo. NULL = pagado con la caja del negocio.';
comment on column public.movimientos.num_pedidos is
  'Solo en el registro diario de ventas.';
comment on column public.movimientos.plataforma is
  'Solo en publicidad: Meta, TikTok, Google.';
comment on column public.movimientos.total_eur is
  'Calculado por trigger. Divisa de reporte de todo el dashboard.';

create index if not exists movimientos_fecha_idx
  on public.movimientos (fecha desc);
create index if not exists movimientos_tipo_idx
  on public.movimientos (tipo);
create index if not exists movimientos_categoria_id_idx
  on public.movimientos (categoria_id);
create index if not exists movimientos_anticipado_por_idx
  on public.movimientos (anticipado_por);
create index if not exists movimientos_tipo_fecha_idx
  on public.movimientos (tipo, fecha desc);


-- 1.5 cuentas_activos — inventario de cuentas, NO una bóveda de contraseñas
create table if not exists public.cuentas_activos (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  tipo              text not null,
  email_asociado    text,
  url               text,
  titular_id        uuid references public.profiles (id),
  coste             numeric(10, 2),
  divisa            text default 'EUR',
  periodicidad      text,
  fecha_renovacion  date,
  estado            text default 'activa',
  notas             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

comment on table public.cuentas_activos is
  'Inventario de cuentas y activos digitales (Shopify, GoDaddy, Klaviyo…). '
  'NO existe ningún campo de contraseña y NO se debe añadir: esto no es un gestor '
  'de credenciales.';
comment on column public.cuentas_activos.tipo is
  'plataforma, dominio, herramienta, red social, banco, proveedor, otro';
comment on column public.cuentas_activos.periodicidad is
  'mensual, anual, puntual, gratuito';
comment on column public.cuentas_activos.estado is
  'activa, pausada, cancelada';


-- 1.6 notas — notas internas compartidas entre los dos socios
create table if not exists public.notas (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  contenido   text,
  fijada      boolean default false,
  etiqueta    text,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on column public.notas.contenido is 'Markdown.';


-- 1.7 integraciones — placeholder para conectar las APIs más adelante
create table if not exists public.integraciones (
  id          uuid primary key default gen_random_uuid(),
  plataforma  text not null unique,
  activa      boolean default false,
  config      jsonb default '{}'::jsonb,
  ultima_sync timestamptz,
  created_at  timestamptz default now()
);

comment on table public.integraciones is
  'Placeholder para conectar Meta Ads y Shopify más adelante.';
comment on column public.integraciones.config is
  'SOLO identificadores de cuenta (ad_account_id, shop_domain…). '
  'Las claves de API NUNCA se guardan en base de datos: van en variables de '
  'entorno de Vercel.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. FUNCIONES Y TRIGGERS
-- ───────────────────────────────────────────────────────────────────────────

-- 2.1 updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.movimientos;
create trigger set_updated_at
  before update on public.movimientos
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.cuentas_activos;
create trigger set_updated_at
  before update on public.cuentas_activos
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.notas;
create trigger set_updated_at
  before update on public.notas
  for each row execute function public.set_updated_at();


-- 2.2 Cálculo de importes de un movimiento
--
-- El cliente solo necesita mandar base_imponible, iva_tipo, divisa y, si la
-- divisa es USD, tasa_cambio. Todo lo demás lo calcula la base de datos, que
-- es la única forma de garantizar que los importes en EUR nunca se desvían.
--
-- iva_importe y total se calculan cuando llegan vacíos (NULL o 0) y también
-- cuando cambia una de sus entradas sin que el cliente los haya recalculado.
-- Si el cliente manda un importe explícito distinto, se respeta: una factura
-- real puede redondear de otra forma.
create or replace function public.calcular_importes_movimiento()
returns trigger
language plpgsql
as $$
begin
  -- La divisa de reporte es el euro: un movimiento en EUR nunca lleva tasa.
  if new.divisa = 'EUR' then
    new.tasa_cambio := 1;
  elsif new.tasa_cambio is null or new.tasa_cambio <= 0 then
    new.tasa_cambio := 1;
  end if;

  if new.iva_tipo is null then
    new.iva_tipo := 0;
  end if;

  -- IVA
  if new.iva_importe is null
     or new.iva_importe = 0
     or (tg_op = 'UPDATE'
         and new.iva_importe is not distinct from old.iva_importe
         and (new.base_imponible is distinct from old.base_imponible
              or new.iva_tipo is distinct from old.iva_tipo))
  then
    new.iva_importe := round(new.base_imponible * new.iva_tipo / 100, 2);
  end if;

  -- Total en divisa original
  if new.total is null
     or new.total = 0
     or (tg_op = 'UPDATE'
         and new.total is not distinct from old.total
         and (new.base_imponible is distinct from old.base_imponible
              or new.iva_importe is distinct from old.iva_importe))
  then
    new.total := new.base_imponible + new.iva_importe;
  end if;

  -- Conversión a la divisa de reporte: siempre derivada, nunca a mano.
  new.total_eur := round(new.total * new.tasa_cambio, 2);
  new.base_eur  := round(new.base_imponible * new.tasa_cambio, 2);

  return new;
end;
$$;

drop trigger if exists calcular_importes on public.movimientos;
create trigger calcular_importes
  before insert or update on public.movimientos
  for each row execute function public.calcular_importes_movimiento();


-- 2.3 Alta automática del perfil al crear el usuario en Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ───────────────────────────────────────────────────────────────────────────
-- 3. SEGURIDAD: función auxiliar, RLS y políticas
-- ───────────────────────────────────────────────────────────────────────────

-- 3.1 ¿Quien pide los datos es uno de los dos socios y sigue activo?
--     security definer para poder leer profiles sin quedar atrapada en la RLS
--     de la propia tabla profiles (recursión infinita).
create or replace function public.es_socio_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and activo = true
  );
$$;

revoke all on function public.es_socio_activo() from public, anon;
grant execute on function public.es_socio_activo() to authenticated;


-- 3.2 RLS activado en TODAS las tablas
alter table public.profiles        enable row level security;
alter table public.categorias      enable row level security;
alter table public.tipos_cambio    enable row level security;
alter table public.movimientos     enable row level security;
alter table public.cuentas_activos enable row level security;
alter table public.notas           enable row level security;
alter table public.integraciones   enable row level security;


-- 3.3 El rol anónimo no pinta nada aquí. Ninguna política lo menciona y
--     además se le retiran los privilegios de tabla.
revoke all on public.profiles        from anon;
revoke all on public.categorias      from anon;
revoke all on public.tipos_cambio    from anon;
revoke all on public.movimientos     from anon;
revoke all on public.cuentas_activos from anon;
revoke all on public.notas           from anon;
revoke all on public.integraciones   from anon;


-- 3.4 Políticas — SEPARADAS por operación, nunca FOR ALL.
--     Todas exigen public.es_socio_activo() y aplican solo a `authenticated`.

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.es_socio_activo());

-- categorias
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

-- Las categorías de sistema no se borran. Las del usuario sí, y la clave
-- foránea de movimientos impide borrar una que tenga movimientos asociados.
drop policy if exists categorias_delete on public.categorias;
create policy categorias_delete on public.categorias
  for delete to authenticated
  using (public.es_socio_activo() and es_sistema = false);

-- tipos_cambio
drop policy if exists tipos_cambio_select on public.tipos_cambio;
create policy tipos_cambio_select on public.tipos_cambio
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists tipos_cambio_insert on public.tipos_cambio;
create policy tipos_cambio_insert on public.tipos_cambio
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists tipos_cambio_update on public.tipos_cambio;
create policy tipos_cambio_update on public.tipos_cambio
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists tipos_cambio_delete on public.tipos_cambio;
create policy tipos_cambio_delete on public.tipos_cambio
  for delete to authenticated
  using (public.es_socio_activo());

-- movimientos
drop policy if exists movimientos_select on public.movimientos;
create policy movimientos_select on public.movimientos
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists movimientos_update on public.movimientos;
create policy movimientos_update on public.movimientos
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists movimientos_delete on public.movimientos;
create policy movimientos_delete on public.movimientos
  for delete to authenticated
  using (public.es_socio_activo());

-- cuentas_activos
drop policy if exists cuentas_activos_select on public.cuentas_activos;
create policy cuentas_activos_select on public.cuentas_activos
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists cuentas_activos_insert on public.cuentas_activos;
create policy cuentas_activos_insert on public.cuentas_activos
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists cuentas_activos_update on public.cuentas_activos;
create policy cuentas_activos_update on public.cuentas_activos
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists cuentas_activos_delete on public.cuentas_activos;
create policy cuentas_activos_delete on public.cuentas_activos
  for delete to authenticated
  using (public.es_socio_activo());

-- notas
drop policy if exists notas_select on public.notas;
create policy notas_select on public.notas
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists notas_insert on public.notas;
create policy notas_insert on public.notas
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists notas_update on public.notas;
create policy notas_update on public.notas
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists notas_delete on public.notas;
create policy notas_delete on public.notas
  for delete to authenticated
  using (public.es_socio_activo());

-- integraciones
drop policy if exists integraciones_select on public.integraciones;
create policy integraciones_select on public.integraciones
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists integraciones_insert on public.integraciones;
create policy integraciones_insert on public.integraciones
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists integraciones_update on public.integraciones;
create policy integraciones_update on public.integraciones
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists integraciones_delete on public.integraciones;
create policy integraciones_delete on public.integraciones
  for delete to authenticated
  using (public.es_socio_activo());


-- ───────────────────────────────────────────────────────────────────────────
-- 4. SEMILLAS
-- ───────────────────────────────────────────────────────────────────────────

-- 4.1 Categorías de GASTO
insert into public.categorias (nombre, tipo, es_sistema, orden) values
  ('Publicidad',                          'gasto', true, 10),
  ('Coste de producto',                   'gasto', true, 20),
  ('Envíos y logística',                  'gasto', true, 30),
  ('Comisiones Shopify',                  'gasto', true, 40),
  ('Comisiones pasarela de pago',         'gasto', true, 50),
  ('Herramientas de IA y software',       'gasto', true, 60),
  ('Dominios y hosting',                  'gasto', true, 70),
  ('Devoluciones y reembolsos',           'gasto', true, 80),
  ('Stock e importación',                 'gasto', true, 90),
  ('Aranceles e impuestos de importación','gasto', true, 100),
  ('Gestoría y asesoría',                 'gasto', true, 110),
  ('Comisiones bancarias',                'gasto', true, 120),
  ('Marca y registro',                    'gasto', true, 130),
  ('Otros',                               'gasto', true, 999)
on conflict (nombre, tipo) do nothing;

-- 4.2 Categorías de INGRESO
insert into public.categorias (nombre, tipo, es_sistema, orden) values
  ('Ventas Shopify', 'ingreso', true, 10),
  ('Otros ingresos', 'ingreso', true, 999)
on conflict (nombre, tipo) do nothing;

-- 4.3 Integraciones — placeholders desactivados.
--     Recordatorio: las claves de API van en variables de entorno de Vercel,
--     NUNCA en esta tabla.
insert into public.integraciones (plataforma, activa, config) values
  ('meta_ads', false, '{}'::jsonb),
  ('shopify',  false, '{}'::jsonb)
on conflict (plataforma) do nothing;
