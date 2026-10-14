begin;
-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — Multi-tienda y medio de pago
--
-- POR QUÉ
--   La sociedad (Daniel y Stiven, 50/50) va a abrir más tiendas y no quiere
--   mezclar sus números. Hasta ahora todo corría sobre TheGlowCoSpain.
--
-- QUÉ ES DE CADA TIENDA Y QUÉ ES DE LA SOCIEDAD
--   Por tienda: movimientos, registro diario, cobros, importaciones,
--   objetivos, KPIs y dashboard. Un movimiento sin tienda (tienda_id NULL) es
--   de «General / Sociedad»: gastos compartidos como Claude o Apimart.
--   Global: liquidación entre socios (anticipos, reembolsos, prorrata,
--   cierres), las cuentas de Banco y PayPal y sus saldos, la tarjeta de
--   Daniel y su cupo, categorías, socios, tipos de cambio y fase inicial.
--   La liquidación no cambia: siempre sumó todos los movimientos, y así las
--   pérdidas de una tienda compensan los beneficios de otra.
--
-- QUÉ CAMBIA
--   1. Tabla `tiendas`. Nunca se borra una tienda con datos: las FK son
--      ON DELETE RESTRICT. Los objetivos mensuales pasan a ser de la tienda.
--   2. `tienda_id` en movimientos, cuentas_activos y notas (nulo = General) y
--      en cobros_pasarela, importaciones y mapeos_importacion (obligatorio).
--      Un ingreso siempre es de una tienda.
--   3. `movimientos.medio_pago` (tarjeta_daniel | bolsillo | banco | paypal),
--      obligatorio en gastos. Sustituye a `cuenta_pago`.
--   4. El cupo de la tarjeta (R6) mide los gastos pagados con la tarjeta, de
--      todas las tiendas y de General. Ya no filtra por categoría.
--   5. Funciones de KPIs, conciliación, diario, importación e IVA con
--      parámetro de tienda. Realtime en movimientos para el widget del cupo.
--
-- COMPATIBILIDAD MIENTRAS SE DESPLIEGA
--   Entre aplicar esto y que Vercel publique la app nueva, producción sigue
--   sirviendo la vieja. Para que no falle nada en esos minutos:
--     · las vistas y funciones antiguas se quedan como estaban (sin tienda,
--       suman todo; hoy todo es de TheGlowCoSpain);
--     · `cuenta_pago` sigue existiendo y el trigger la traduce a medio_pago;
--     · las columnas tienda_id llevan como valor por defecto TheGlowCoSpain.
--   La 0019 retira todo eso cuando la app nueva esté verificada.
--
-- LO QUE NO CAMBIA
--   Ningún importe. La migración se comprueba a sí misma: hace una foto de
--   todas las cifras antes, otra después (de TheGlowCoSpain y de «todas») y
--   aborta si una sola difiere en un céntimo. Los cierres no se tocan.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 0. FOTO DE ANTES
-- ───────────────────────────────────────────────────────────────────────────

create temporary table _foto_0018 (
  momento text primary key,
  datos   jsonb not null
) on commit drop;

-- Lo que es global antes y después: se mide con las mismas funciones.
create or replace function pg_temp.foto_comun(p_tienda uuid)
returns jsonb language plpgsql as $$
declare v_foto jsonb;
begin
  select jsonb_build_object(
    'tesoreria',         (select to_jsonb(t) from public.fn_tesoreria(current_date) t),
    'liquidacion',       public.fn_estado_liquidacion(current_date),
    'liquidacion_final', public.fn_liquidacion_final(),
    'anticipos', (select coalesce(jsonb_agg(jsonb_build_object(
                    'socio', a.nombre, 'anticipado', a.anticipado, 'reembolsado', a.reembolsado,
                    'pendiente', a.pendiente, 'num', a.num_anticipos) order by a.nombre), '[]')
                  from public.vw_anticipos_socio a),
    'pendientes', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', p.id, 'pendiente', p.pendiente_eur) order by p.id), '[]')
                  from public.vw_anticipos_pendientes p),
    'cierres',   (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from public.cierres c),
    'reembolsos',(select jsonb_build_object('n', count(*), 'suma', coalesce(sum(importe_eur), 0))
                  from public.reembolsos)
  ) into v_foto;
  return v_foto;
end $$;

insert into _foto_0018
select 'antes', pg_temp.foto_comun(null) || jsonb_build_object(
  'resumen',    (select to_jsonb(r) from public.fn_resumen_periodo('2000-01-01', '2100-12-31') r),
  'mensual',    (select coalesce(jsonb_agg(to_jsonb(v) order by v.mes), '[]') from public.vw_resumen_mensual v),
  'diario',     (select coalesce(jsonb_agg(to_jsonb(v) order by v.fecha), '[]') from public.vw_resumen_diario v),
  'categorias', (select coalesce(jsonb_agg(to_jsonb(v) order by v.mes, v.categoria_id), '[]') from public.vw_gastos_categoria v),
  'iva',        public.fn_resumen_iva('2000-01-01', '2100-12-31'),
  'conciliacion', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'ventas', c.ventas_registradas, 'diferencia', c.diferencia,
                    'cuadra', c.cuadra, 'solapados', c.solapados) order by c.id), '[]')
                  from public.vw_cobros_conciliacion c),
  'cobertura',  (select coalesce(jsonb_agg(jsonb_build_object(
                    'fecha', v.fecha, 'metodo', v.metodo_cobro, 'ventas', v.ventas,
                    'pedidos', v.pedidos, 'cobro', v.cobro_id) order by v.fecha, v.metodo_cobro), '[]')
                  from public.vw_ventas_cobertura v),
  'filas', jsonb_build_object(
    'movimientos', (select count(*) from public.movimientos),
    'total_eur',   (select coalesce(sum(total_eur), 0) from public.movimientos),
    'cobros',      (select count(*) from public.cobros_pasarela),
    'cuentas',     (select count(*) from public.cuentas_activos),
    'notas',       (select count(*) from public.notas))
);


-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABLA TIENDAS
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.tiendas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null unique,
  slug              text not null unique,
  url_shopify       text,
  color             text not null default '#74A5A2',
  fecha_lanzamiento date,
  estado            text not null default 'activa',
  objetivo_mes      jsonb not null default '{"facturacion": 0, "beneficio": 0}'::jsonb,
  notas             text,
  created_by        uuid not null default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tiendas_estado_valido  check (estado in ('activa', 'pausada', 'archivada')),
  constraint tiendas_color_hex      check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tiendas_slug_valido    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                                           and slug not in ('todas', 'general')),
  constraint tiendas_nombre_no_vacio check (length(trim(nombre)) > 0)
);

comment on table public.tiendas is
  'Tiendas de la sociedad. Nunca se borra una con datos (FK ON DELETE RESTRICT): '
  'se archiva. Lo que no es de ninguna tienda (tienda_id NULL) es de General / Sociedad.';
comment on column public.tiendas.slug is
  'Identificador en la URL (?tienda=slug). «todas» y «general» están reservados.';
comment on column public.tiendas.objetivo_mes is
  '{"facturacion": number, "beneficio": number}. Objetivos mensuales de la tienda.';

drop trigger if exists set_updated_at on public.tiendas;
create trigger set_updated_at
  before update on public.tiendas
  for each row execute function public.set_updated_at();

alter table public.tiendas enable row level security;
revoke all on public.tiendas from anon;
grant select, insert, update, delete on public.tiendas to authenticated;

-- Las tiendas son de los dos: cualquiera de los socios puede editarlas,
-- pausarlas o archivarlas. Borrar, solo quien la creó, y solo si está vacía
-- (lo impiden las claves foráneas).
drop policy if exists tiendas_select on public.tiendas;
create policy tiendas_select on public.tiendas
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists tiendas_insert on public.tiendas;
create policy tiendas_insert on public.tiendas
  for insert to authenticated
  with check (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists tiendas_update on public.tiendas;
create policy tiendas_update on public.tiendas
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists tiendas_delete on public.tiendas;
create policy tiendas_delete on public.tiendas
  for delete to authenticated
  using (public.es_socio_activo() and created_by = auth.uid());


-- 1.1 TheGlowCoSpain, con los objetivos que había en ajustes.
insert into public.tiendas (nombre, slug, color, fecha_lanzamiento, estado, objetivo_mes, created_by)
select
  'TheGlowCoSpain', 'theglowcospain', '#74A5A2', date '2026-09-07', 'activa',
  coalesce((select valor from public.ajustes where clave = 'objetivo_mes'),
           '{"facturacion": 0, "beneficio": 0}'::jsonb),
  coalesce(
    (select nullif(valor ->> 'socio_id', '')::uuid from public.ajustes where clave = 'limite_aportacion'),
    (select created_by from public.movimientos order by created_at limit 1),
    (select id from public.profiles order by nombre limit 1))
where not exists (select 1 from public.tiendas where slug = 'theglowcospain');


-- ───────────────────────────────────────────────────────────────────────────
-- 2. COLUMNAS tienda_id Y medio_pago
-- ───────────────────────────────────────────────────────────────────────────

alter table public.movimientos
  add column if not exists tienda_id  uuid references public.tiendas (id) on delete restrict,
  add column if not exists medio_pago text;
alter table public.cobros_pasarela
  add column if not exists tienda_id uuid references public.tiendas (id) on delete restrict;
alter table public.importaciones
  add column if not exists tienda_id uuid references public.tiendas (id) on delete restrict;
alter table public.mapeos_importacion
  add column if not exists tienda_id uuid references public.tiendas (id) on delete restrict;
alter table public.cuentas_activos
  add column if not exists tienda_id uuid references public.tiendas (id) on delete restrict;
alter table public.notas
  add column if not exists tienda_id uuid references public.tiendas (id) on delete restrict;

comment on column public.movimientos.tienda_id is
  'Tienda a la que pertenece. NULL = General / Sociedad (gastos compartidos). '
  'Un ingreso siempre es de una tienda.';
comment on column public.movimientos.medio_pago is
  'Solo en gastos. tarjeta_daniel: tarjeta de crédito del socio de la tarjeta '
  '(anticipado_por queda fijado a él). bolsillo: lo adelantó un socio '
  '(anticipado_por obligatorio). banco / paypal: cuentas del negocio, sin anticipo.';
comment on column public.movimientos.cuenta_pago is
  'OBSOLETA desde la 0018: la mantiene el trigger a partir de medio_pago para la '
  'versión anterior de la app. La borra la 0019.';
comment on column public.cobros_pasarela.tienda_id is
  'Tienda del cobro. Concilia solo con las ventas de esa tienda y ese método.';
comment on column public.cuentas_activos.tienda_id is
  'NULL = cuenta de la sociedad. El gasto que genera al pagarse hereda la tienda.';
comment on column public.notas.tienda_id is 'NULL = nota general.';

-- 2.1 Relleno: todo lo existente es de TheGlowCoSpain, y el medio de pago se
--     deduce de lo que ya había. Sin tocar updated_at, sin recalcular
--     importes y sin que el escudo de los gastos de cobros lo impida.
alter table public.movimientos disable trigger set_updated_at;
alter table public.movimientos disable trigger calcular_importes;
alter table public.movimientos disable trigger normalizar_cuentas;
alter table public.cuentas_activos disable trigger set_updated_at;
alter table public.notas disable trigger set_updated_at;
-- Rellenar la tienda de un cobro no debe regenerar sus gastos.
alter table public.cobros_pasarela disable trigger cobros_generar_gastos;
select set_config('app.cobro_sincronizando', 'on', true);

do $$
declare
  v_tienda uuid := (select id from public.tiendas where slug = 'theglowcospain');
begin
  update public.movimientos set tienda_id = v_tienda where tienda_id is null;
  update public.cobros_pasarela set tienda_id = v_tienda where tienda_id is null;
  update public.importaciones set tienda_id = v_tienda where tienda_id is null;
  update public.mapeos_importacion set tienda_id = v_tienda where tienda_id is null;
  update public.cuentas_activos set tienda_id = v_tienda where tienda_id is null;
  update public.notas set tienda_id = v_tienda where tienda_id is null;

  -- Con socio → bolsillo. Sin socio → la cuenta que ya tenía (2 banco, 3
  -- PayPal). Ninguno pasa a tarjeta: eso lo deciden los socios.
  update public.movimientos
     set medio_pago = case
           when anticipado_por is not null then 'bolsillo'
           else coalesce(cuenta_pago, 'banco')
         end
   where tipo = 'gasto' and medio_pago is null;

  -- Durante el despliegue, lo que la app vieja cree sin tienda va a
  -- TheGlowCoSpain, la única que conoce. La 0019 retira estos valores.
  execute format('alter table public.movimientos       alter column tienda_id set default %L::uuid', v_tienda);
  execute format('alter table public.cobros_pasarela   alter column tienda_id set default %L::uuid', v_tienda);
  execute format('alter table public.importaciones     alter column tienda_id set default %L::uuid', v_tienda);
  execute format('alter table public.mapeos_importacion alter column tienda_id set default %L::uuid', v_tienda);
  execute format('alter table public.cuentas_activos   alter column tienda_id set default %L::uuid', v_tienda);
  execute format('alter table public.notas             alter column tienda_id set default %L::uuid', v_tienda);
end $$;

select set_config('app.cobro_sincronizando', 'off', true);
alter table public.movimientos enable trigger set_updated_at;
alter table public.movimientos enable trigger calcular_importes;
alter table public.movimientos enable trigger normalizar_cuentas;
alter table public.cuentas_activos enable trigger set_updated_at;
alter table public.notas enable trigger set_updated_at;
alter table public.cobros_pasarela enable trigger cobros_generar_gastos;

alter table public.cobros_pasarela    alter column tienda_id set not null;
alter table public.importaciones      alter column tienda_id set not null;
alter table public.mapeos_importacion alter column tienda_id set not null;

-- 2.2 Reglas.
alter table public.movimientos
  drop constraint if exists movimientos_cuenta_pago_valida,
  drop constraint if exists movimientos_cuenta_solo_negocio,
  drop constraint if exists movimientos_medio_pago_valido,
  drop constraint if exists movimientos_medio_pago_solo_gastos,
  drop constraint if exists movimientos_medio_pago_anticipo,
  drop constraint if exists movimientos_ingreso_con_tienda;

alter table public.movimientos
  add constraint movimientos_medio_pago_valido
    check (medio_pago in ('tarjeta_daniel', 'bolsillo', 'banco', 'paypal')),
  -- Obligatorio en gastos, prohibido en ingresos.
  add constraint movimientos_medio_pago_solo_gastos
    check ((tipo = 'gasto') = (medio_pago is not null)),
  -- Tarjeta y bolsillo son anticipos de un socio; banco y PayPal, no.
  add constraint movimientos_medio_pago_anticipo
    check (medio_pago is null
           or (medio_pago in ('tarjeta_daniel', 'bolsillo')) = (anticipado_por is not null)),
  add constraint movimientos_ingreso_con_tienda
    check (tipo = 'gasto' or tienda_id is not null);

-- 2.3 Índices.
create index if not exists movimientos_tienda_fecha_idx on public.movimientos (tienda_id, fecha desc);
create index if not exists movimientos_medio_pago_idx   on public.movimientos (medio_pago)
  where medio_pago = 'tarjeta_daniel';
create index if not exists cobros_tienda_idx            on public.cobros_pasarela (tienda_id, fecha_cobro desc);
create index if not exists importaciones_tienda_idx     on public.importaciones (tienda_id);
create index if not exists mapeos_tienda_idx            on public.mapeos_importacion (tienda_id);
create index if not exists cuentas_tienda_idx           on public.cuentas_activos (tienda_id);
create index if not exists notas_tienda_idx             on public.notas (tienda_id);

-- Dos tiendas pueden tener payouts con la misma referencia: la referencia es
-- única dentro de la tienda y la plataforma.
drop index if exists public.cobros_referencia_unica;
create unique index cobros_referencia_unica
  on public.cobros_pasarela (tienda_id, plataforma, referencia)
  where referencia is not null;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. MEDIO DE PAGO: el trigger que aplica las reglas
-- ───────────────────────────────────────────────────────────────────────────

-- El socio de la tarjeta sale del ajuste del cupo, no de un nombre.
create or replace function public.fn_socio_tarjeta()
returns uuid
language sql
stable
set search_path = public
as $$
  select nullif(valor ->> 'socio_id', '')::uuid
  from public.ajustes where clave = 'limite_aportacion';
$$;

comment on function public.fn_socio_tarjeta() is
  'Socio titular de la tarjeta de crédito del negocio (ajustes.limite_aportacion.socio_id).';

create or replace function public.normalizar_medio_pago()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_socio uuid;
begin
  if new.tienda_id is not null
     and (tg_op = 'INSERT' or new.tienda_id is distinct from old.tienda_id)
     and exists (select 1 from public.tiendas t where t.id = new.tienda_id and t.estado = 'archivada') then
    raise exception 'La tienda está archivada: no admite movimientos nuevos.';
  end if;

  if new.tipo = 'ingreso' then
    new.medio_pago  := null;
    new.cuenta_pago := null;
    if new.metodo_cobro is null and exists (
      select 1 from public.categorias c
       where c.id = new.categoria_id and c.nombre = 'Ventas Shopify'
    ) then
      new.metodo_cobro := 'shopify_payments';
    end if;
    return new;
  end if;

  new.metodo_cobro := null;

  -- Compatibilidad con la app anterior a la 0018, que no conoce medio_pago y
  -- edita cuenta_pago y anticipado_por. Si cambian ellos y no el medio, el
  -- medio se vuelve a deducir. (La 0019 lo simplifica.)
  if tg_op = 'UPDATE' and new.medio_pago is not distinct from old.medio_pago and (
       new.cuenta_pago is distinct from old.cuenta_pago
       or (new.anticipado_por is distinct from old.anticipado_por
           and (new.medio_pago in ('banco', 'paypal') or new.anticipado_por is null))
     ) then
    new.medio_pago := null;
  end if;

  -- Sin medio (importación, inventario de cuentas, app vieja): se deduce.
  if new.medio_pago is null then
    new.medio_pago := case
      when new.anticipado_por is not null then 'bolsillo'
      else coalesce(new.cuenta_pago, 'banco')
    end;
  end if;

  if new.medio_pago = 'tarjeta_daniel' then
    v_socio := public.fn_socio_tarjeta();
    if v_socio is null then
      raise exception 'No hay ningún socio asignado a la tarjeta (ajuste «limite_aportacion»).';
    end if;
    new.anticipado_por := v_socio;
  elsif new.medio_pago = 'bolsillo' then
    if new.anticipado_por is null then
      raise exception 'Un gasto pagado de bolsillo necesita saber qué socio lo adelantó.';
    end if;
  else
    new.anticipado_por := null;
  end if;

  -- Un anticipo ya reembolsado (aunque sea en parte) no puede cambiar de socio:
  -- descuadraría la liquidación.
  if tg_op = 'UPDATE' and new.anticipado_por is distinct from old.anticipado_por
     and exists (select 1 from public.reembolso_movimientos rm where rm.movimiento_id = old.id) then
    raise exception
      'Este gasto ya tiene reembolsos aplicados: no se puede cambiar quién lo pagó. '
      'Anula antes el reembolso en /liquidacion.';
  end if;

  new.cuenta_pago := case when new.medio_pago in ('banco', 'paypal') then new.medio_pago end;
  return new;
end;
$$;

drop trigger if exists normalizar_cuentas on public.movimientos;
drop trigger if exists normalizar_medio_pago on public.movimientos;
create trigger normalizar_medio_pago
  before insert or update on public.movimientos
  for each row execute function public.normalizar_medio_pago();

drop function if exists public.normalizar_cuentas_movimiento();


-- ───────────────────────────────────────────────────────────────────────────
-- 4. GASTOS GENERADOS: heredan la tienda
-- ───────────────────────────────────────────────────────────────────────────

drop function if exists public.fn_cobro_sincronizar_gasto(uuid, numeric, text, text, date, uuid, text);

create or replace function public.fn_cobro_sincronizar_gasto(
  p_movimiento uuid,
  p_importe    numeric,
  p_categoria  text,
  p_concepto   text,
  p_fecha      date,
  p_autor      uuid,
  p_cuenta     text,
  p_tienda     uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_categoria uuid;
  v_id        uuid := p_movimiento;
begin
  if coalesce(p_importe, 0) <= 0 then
    if v_id is not null then
      delete from public.movimientos where id = v_id;
    end if;
    return null;
  end if;

  select id into v_categoria
  from public.categorias
  where nombre = p_categoria and tipo = 'gasto';

  if v_categoria is null then
    raise exception
      'No existe la categoría de gasto «%». Es una categoría de sistema: revisa /categorias.',
      p_categoria;
  end if;

  if v_id is null then
    insert into public.movimientos (
      tipo, fecha, concepto, categoria_id, divisa,
      base_imponible, iva_tipo, iva_importe, total,
      tasa_cambio, total_eur, base_eur,
      anticipado_por, medio_pago, tienda_id, notas, created_by
    )
    values (
      'gasto', p_fecha, p_concepto, v_categoria, 'EUR',
      p_importe, 0, 0, p_importe,
      1, p_importe, p_importe,
      null,  -- lo pagó el negocio: se descontó solo del cobro
      p_cuenta, p_tienda,
      'Generado automáticamente por un cobro o un traspaso. Se modifica desde /cobros.',
      p_autor
    )
    returning id into v_id;
  else
    update public.movimientos
       set fecha          = p_fecha,
           concepto       = p_concepto,
           categoria_id   = v_categoria,
           divisa         = 'EUR',
           base_imponible = p_importe,
           iva_tipo       = 0,
           iva_importe    = 0,
           total          = p_importe,
           tasa_cambio    = 1,
           anticipado_por = null,
           medio_pago     = p_cuenta,
           tienda_id      = p_tienda
     where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.cobros_generar_gastos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_etiqueta text;
  v_sufijo   text;
  v_cuenta   text;
begin
  perform set_config('app.cobro_sincronizando', 'on', true);

  if tg_op = 'DELETE' then
    delete from public.movimientos
     where id in (old.movimiento_comision_id, old.movimiento_devolucion_id);
    perform set_config('app.cobro_sincronizando', 'off', true);
    return old;
  end if;

  if new.plataforma = 'PayPal' then
    v_etiqueta := 'PayPal';
    v_sufijo   := ' — ' || to_char(new.fecha_cobro, 'DD/MM');
    v_cuenta   := 'paypal';
  else
    v_etiqueta := 'Shopify';
    v_sufijo   := ' — pago del ' || to_char(new.fecha_cobro, 'DD/MM');
    v_cuenta   := 'banco';
  end if;

  -- Las comisiones y devoluciones de un cobro son de su tienda.
  new.movimiento_comision_id := public.fn_cobro_sincronizar_gasto(
    case when tg_op = 'UPDATE' then old.movimiento_comision_id end,
    new.comisiones,
    'Comisiones pasarela de pago',
    'Comisiones ' || v_etiqueta || v_sufijo,
    new.fecha_cobro,
    new.created_by,
    v_cuenta,
    new.tienda_id
  );

  new.movimiento_devolucion_id := public.fn_cobro_sincronizar_gasto(
    case when tg_op = 'UPDATE' then old.movimiento_devolucion_id end,
    new.devoluciones,
    'Devoluciones y reembolsos',
    'Devoluciones ' || v_etiqueta || v_sufijo,
    new.fecha_cobro,
    new.created_by,
    v_cuenta,
    new.tienda_id
  );

  perform set_config('app.cobro_sincronizando', 'off', true);
  return new;
end;
$$;

-- El traspaso PayPal → Banco es de la sociedad: su comisión va a General.
create or replace function public.traspasos_generar_gasto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.cobro_sincronizando', 'on', true);

  if tg_op = 'DELETE' then
    delete from public.movimientos where id = old.movimiento_comision_id;
    perform set_config('app.cobro_sincronizando', 'off', true);
    return old;
  end if;

  new.movimiento_comision_id := public.fn_cobro_sincronizar_gasto(
    case when tg_op = 'UPDATE' then old.movimiento_comision_id end,
    new.comision,
    'Comisiones pasarela de pago',
    'Comisión traspaso PayPal — ' || to_char(new.fecha, 'DD/MM'),
    new.fecha,
    new.created_by,
    'paypal',
    null
  );

  perform set_config('app.cobro_sincronizando', 'off', true);
  return new;
end;
$$;

-- El pago de una cuenta del inventario va a la tienda de la cuenta.
create or replace function public.fn_registrar_pago_cuenta(
  p_cuenta    uuid,
  p_fecha     date    default current_date,
  p_importe   numeric default null,
  p_categoria uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor        uuid := auth.uid();
  v_cuenta       record;
  v_categoria    uuid;
  v_importe      numeric;
  v_tasa         numeric := 1;
  v_movimiento   uuid;
  v_nueva_fecha  date;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  select * into v_cuenta from public.cuentas_activos where id = p_cuenta;
  if v_cuenta.id is null then
    raise exception 'Esa cuenta no existe.';
  end if;

  v_categoria := coalesce(p_categoria, v_cuenta.categoria_gasto_id);
  if v_categoria is null then
    raise exception
      'La cuenta «%» no tiene categoría de gasto asignada: no se sabe dónde imputar el pago.',
      v_cuenta.nombre;
  end if;

  v_importe := coalesce(p_importe, v_cuenta.coste);
  if v_importe is null or v_importe <= 0 then
    raise exception 'La cuenta «%» no tiene un coste con el que registrar el pago.', v_cuenta.nombre;
  end if;

  if coalesce(v_cuenta.divisa, 'EUR') = 'USD' then
    select tasa_a_eur into v_tasa
    from public.tipos_cambio where divisa = 'USD'
    order by fecha desc limit 1;
    v_tasa := coalesce(v_tasa, 1);
  end if;

  -- Con titular, lo adelantó él (bolsillo); sin titular, sale del banco.
  -- El trigger normalizar_medio_pago deduce el medio.
  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur,
    anticipado_por, tienda_id, notas, created_by
  )
  values (
    'gasto', p_fecha, v_cuenta.nombre, v_categoria, coalesce(v_cuenta.divisa, 'EUR'),
    v_importe, 0, 0, v_importe,
    v_tasa, round(v_importe * v_tasa, 2), round(v_importe * v_tasa, 2),
    v_cuenta.titular_id,
    v_cuenta.tienda_id,
    'Pago registrado desde el inventario de cuentas.',
    v_actor
  )
  returning id into v_movimiento;

  v_nueva_fecha := case lower(coalesce(v_cuenta.periodicidad, ''))
    when 'mensual' then coalesce(v_cuenta.fecha_renovacion, p_fecha) + interval '1 month'
    when 'anual'   then coalesce(v_cuenta.fecha_renovacion, p_fecha) + interval '1 year'
    else v_cuenta.fecha_renovacion
  end;

  update public.cuentas_activos
     set ultimo_pago = p_fecha,
         fecha_renovacion = v_nueva_fecha
   where id = p_cuenta;

  return jsonb_build_object(
    'movimiento_id',        v_movimiento,
    'ultimo_pago',          p_fecha,
    'fecha_renovacion',     v_nueva_fecha,
    'importe',              round(v_importe, 2),
    'importe_eur',          round(v_importe * v_tasa, 2),
    'periodicidad',         v_cuenta.periodicidad,
    'renovacion_avanzada',  (v_nueva_fecha is distinct from v_cuenta.fecha_renovacion)
  );
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. ÁMBITO: tienda, todas o solo General
-- ───────────────────────────────────────────────────────────────────────────
-- Convención de todas las funciones por tienda:
--   p_tienda = null, p_solo_general = false → todas las tiendas + General
--   p_tienda = X                            → solo la tienda X
--   p_solo_general = true                   → solo General (tienda_id NULL)

create or replace function public.fn_en_ambito(p_fila uuid, p_tienda uuid, p_solo_general boolean)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(p_solo_general, false) then p_fila is null
    when p_tienda is null then true
    else p_fila is not distinct from p_tienda
  end;
$$;

comment on function public.fn_en_ambito(uuid, uuid, boolean) is
  'true si una fila con tienda p_fila entra en el ámbito pedido. Ver la convención en la 0018.';


-- 5.1 KPIs del dashboard. Mismas columnas que las vistas de la 0003, que se
--     quedan hasta la 0019 para la app anterior.

create or replace function public.fn_resumen_periodo(
  p_desde date, p_hasta date, p_tienda uuid, p_solo_general boolean
)
returns table (
  ingresos numeric, gastos numeric, beneficio numeric, gasto_ads numeric,
  pedidos integer, impresiones bigint, clicks integer
)
language sql
stable
set search_path = public
as $$
  select
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0), 2),
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0), 2),
    round(
      coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0)
      - coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0)
    , 2),
    round(coalesce(sum(m.total_eur) filter (
      where m.tipo = 'gasto' and c.nombre = 'Publicidad'
    ), 0), 2),
    coalesce(sum(m.num_pedidos), 0)::int,
    coalesce(sum(m.impresiones), 0)::bigint,
    coalesce(sum(m.clicks), 0)::int
  from public.movimientos m
  join public.categorias c on c.id = m.categoria_id
  where m.fecha between p_desde and p_hasta
    and public.fn_en_ambito(m.tienda_id, p_tienda, p_solo_general);
$$;

create or replace function public.fn_resumen_diario(p_tienda uuid, p_solo_general boolean)
returns table (
  fecha date, ingresos numeric, gastos numeric, beneficio numeric, pedidos integer,
  gasto_ads numeric, impresiones bigint, clicks integer
)
language sql
stable
set search_path = public
as $$
  select
    m.fecha,
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0), 2),
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0), 2),
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0)
          - coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0), 2),
    coalesce(sum(m.num_pedidos), 0)::int,
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto' and c.nombre = 'Publicidad'), 0), 2),
    coalesce(sum(m.impresiones), 0)::bigint,
    coalesce(sum(m.clicks), 0)::int
  from public.movimientos m
  join public.categorias c on c.id = m.categoria_id
  where public.fn_en_ambito(m.tienda_id, p_tienda, p_solo_general)
  group by m.fecha;
$$;

create or replace function public.fn_resumen_mensual(p_tienda uuid, p_solo_general boolean)
returns table (
  mes date, ingresos numeric, gastos numeric, beneficio numeric, margen numeric,
  gasto_ads numeric, roas numeric, pedidos integer, ticket_medio numeric
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      date_trunc('month', m.fecha)::date as mes,
      coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0) as ingresos,
      coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0)   as gastos,
      coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto' and c.nombre = 'Publicidad'), 0) as gasto_ads,
      coalesce(sum(m.num_pedidos), 0) as pedidos
    from public.movimientos m
    join public.categorias c on c.id = m.categoria_id
    where public.fn_en_ambito(m.tienda_id, p_tienda, p_solo_general)
    group by 1
  )
  select
    mes,
    round(ingresos, 2),
    round(gastos, 2),
    round(ingresos - gastos, 2),
    case when ingresos > 0 then round((ingresos - gastos) / ingresos * 100, 1) end,
    round(gasto_ads, 2),
    case when gasto_ads > 0 then round(ingresos / gasto_ads, 1) end,
    pedidos::int,
    case when pedidos > 0 then round(ingresos / pedidos, 2) end
  from base;
$$;

create or replace function public.fn_gastos_categoria(p_tienda uuid, p_solo_general boolean)
returns table (mes date, categoria_id uuid, categoria text, total numeric)
language sql
stable
set search_path = public
as $$
  select date_trunc('month', m.fecha)::date, c.id, c.nombre, round(sum(m.total_eur), 2)
  from public.movimientos m
  join public.categorias c on c.id = m.categoria_id
  where m.tipo = 'gasto'
    and public.fn_en_ambito(m.tienda_id, p_tienda, p_solo_general)
  group by 1, 2, 3;
$$;

-- 5.2 Comparativa por tienda (vista «Todas»): una fila por tienda y otra
--     para General. Las archivadas solo salen si tienen movimientos en el
--     periodo.
create or replace function public.fn_comparativa_tiendas(p_desde date, p_hasta date)
returns table (
  tienda_id uuid, nombre text, color text, estado text,
  ingresos numeric, gastos numeric, beneficio numeric, gasto_ads numeric,
  roas numeric, margen numeric, pedidos integer
)
language sql
stable
set search_path = public
as $$
  with ambitos as (
    select t.id, t.nombre, t.color, t.estado, 0 as orden from public.tiendas t
    union all
    select null, 'General / Sociedad', null, null, 1
  ),
  agregado as (
    select
      m.tienda_id,
      coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0) as ingresos,
      coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0)   as gastos,
      coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto' and c.nombre = 'Publicidad'), 0) as gasto_ads,
      coalesce(sum(m.num_pedidos), 0) as pedidos
    from public.movimientos m
    join public.categorias c on c.id = m.categoria_id
    where m.fecha between p_desde and p_hasta
    group by m.tienda_id
  )
  select
    a.id, a.nombre, a.color, a.estado,
    round(coalesce(g.ingresos, 0), 2),
    round(coalesce(g.gastos, 0), 2),
    round(coalesce(g.ingresos, 0) - coalesce(g.gastos, 0), 2),
    round(coalesce(g.gasto_ads, 0), 2),
    case when coalesce(g.gasto_ads, 0) > 0 then round(g.ingresos / g.gasto_ads, 2) end,
    case when coalesce(g.ingresos, 0) > 0 then round((g.ingresos - g.gastos) / g.ingresos * 100, 1) end,
    coalesce(g.pedidos, 0)::int
  from ambitos a
  left join agregado g on g.tienda_id is not distinct from a.id
  where a.estado is distinct from 'archivada' or g.tienda_id is not null
  order by a.orden, a.nombre;
$$;


-- 5.3 IVA y libro para la gestoría, por tienda o consolidado.
create or replace function public.fn_resumen_iva(
  p_desde date, p_hasta date, p_tienda uuid, p_solo_general boolean
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_ingresos    jsonb;
  v_gastos      jsonb;
  v_repercutido numeric := 0;
  v_soportado   numeric := 0;
begin
  with filas as (
    select
      m.tipo,
      case when m.iva_tipo in (21, 10, 4, 0) then m.iva_tipo else null end as tipo_iva,
      m.base_eur,
      round(m.total_eur - m.base_eur, 2) as cuota_eur,
      m.total_eur
    from public.movimientos m
    where m.fecha between p_desde and p_hasta
      and public.fn_en_ambito(m.tienda_id, p_tienda, p_solo_general)
  ),
  agregado as (
    select tipo, tipo_iva,
           count(*)::int            as operaciones,
           round(sum(base_eur), 2)  as base,
           round(sum(cuota_eur), 2) as cuota,
           round(sum(total_eur), 2) as total
    from filas group by tipo, tipo_iva
  ),
  totales as (
    select tipo,
           count(*)::int            as operaciones,
           round(sum(base_eur), 2)  as base,
           round(sum(cuota_eur), 2) as cuota,
           round(sum(total_eur), 2) as total
    from filas group by tipo
  )
  select
    jsonb_build_object(
      'por_tipo', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tipo_iva', a.tipo_iva, 'operaciones', a.operaciones,
                 'base', a.base, 'cuota', a.cuota, 'total', a.total)
               order by a.tipo_iva desc nulls last)
        from agregado a where a.tipo = 'ingreso'), '[]'::jsonb),
      'operaciones', coalesce((select operaciones from totales where tipo = 'ingreso'), 0),
      'base',        coalesce((select base from totales where tipo = 'ingreso'), 0),
      'cuota',       coalesce((select cuota from totales where tipo = 'ingreso'), 0),
      'total',       coalesce((select total from totales where tipo = 'ingreso'), 0)
    ),
    jsonb_build_object(
      'por_tipo', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tipo_iva', a.tipo_iva, 'operaciones', a.operaciones,
                 'base', a.base, 'cuota', a.cuota, 'total', a.total)
               order by a.tipo_iva desc nulls last)
        from agregado a where a.tipo = 'gasto'), '[]'::jsonb),
      'operaciones', coalesce((select operaciones from totales where tipo = 'gasto'), 0),
      'base',        coalesce((select base from totales where tipo = 'gasto'), 0),
      'cuota',       coalesce((select cuota from totales where tipo = 'gasto'), 0),
      'total',       coalesce((select total from totales where tipo = 'gasto'), 0)
    )
    into v_ingresos, v_gastos;

  v_repercutido := coalesce((v_ingresos ->> 'cuota')::numeric, 0);
  v_soportado   := coalesce((v_gastos   ->> 'cuota')::numeric, 0);

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'ingresos', v_ingresos,
    'gastos', v_gastos,
    'iva_repercutido', v_repercutido,
    'iva_soportado', v_soportado,
    'diferencia', round(v_repercutido - v_soportado, 2),
    'cuadre', jsonb_build_object(
      'ingresos', public.fn_cuadre_bloque(v_ingresos),
      'gastos',   public.fn_cuadre_bloque(v_gastos)
    )
  );
end;
$$;

-- Se añaden columnas al final: create or replace no admite otra cosa.
create or replace view public.vw_libro_gestoria
with (security_invoker = true) as
select
  m.id, m.fecha, m.tipo, m.concepto, c.nombre as categoria,
  m.divisa, m.base_imponible, m.iva_tipo, m.iva_importe, m.total,
  m.tasa_cambio, m.base_eur,
  round(m.total_eur - m.base_eur, 2) as cuota_eur,
  m.total_eur,
  p.nombre as anticipado_por,
  m.notas,
  m.tienda_id,
  coalesce(t.nombre, 'General / Sociedad') as tienda,
  m.medio_pago
from public.movimientos m
join public.categorias c on c.id = m.categoria_id
left join public.profiles p on p.id = m.anticipado_por
left join public.tiendas t on t.id = m.tienda_id;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. COBROS, DIARIO E IMPORTACIÓN POR TIENDA
-- ───────────────────────────────────────────────────────────────────────────

create or replace view public.vw_cobros_conciliacion
with (security_invoker = true) as
select
  c.id, c.fecha_cobro, c.periodo_desde, c.periodo_hasta, c.plataforma,
  c.importe_bruto, c.comisiones, c.devoluciones, c.otros_ajustes, c.importe_neto,
  c.referencia, c.notas, c.movimiento_comision_id, c.movimiento_devolucion_id,
  c.created_by, c.created_at, c.metodo_cobro,
  coalesce(v.ventas, 0) as ventas_registradas,
  round(c.importe_bruto - coalesce(v.ventas, 0), 2) as diferencia,
  abs(c.importe_bruto - coalesce(v.ventas, 0)) < 0.005 as cuadra,
  case when c.importe_bruto > 0 then round(c.comisiones / c.importe_bruto * 100, 2) end as pct_comision,
  p.nombre as autor_nombre,
  coalesce(s.solapados, '[]'::jsonb) as solapados,
  c.tienda_id
from public.cobros_pasarela c
left join public.profiles p on p.id = c.created_by
left join lateral (
  select round(sum(m.total_eur), 2) as ventas
  from public.movimientos m
  join public.categorias cat on cat.id = m.categoria_id
  where m.tipo = 'ingreso' and cat.nombre = 'Ventas Shopify'
    and m.tienda_id = c.tienda_id
    and m.metodo_cobro = c.metodo_cobro
    and m.fecha between c.periodo_desde and c.periodo_hasta
) v on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
           'id', o.id, 'fecha_cobro', o.fecha_cobro, 'periodo_desde', o.periodo_desde,
           'periodo_hasta', o.periodo_hasta, 'referencia', o.referencia)
         order by o.fecha_cobro) as solapados
  from public.cobros_pasarela o
  where o.id <> c.id
    and o.tienda_id = c.tienda_id
    and o.plataforma = c.plataforma
    and o.periodo_desde <= c.periodo_hasta and o.periodo_hasta >= c.periodo_desde
) s on true;

create or replace view public.vw_ventas_cobertura
with (security_invoker = true) as
select
  v.fecha, v.metodo_cobro, v.ventas, v.pedidos,
  c.id as cobro_id, c.fecha_cobro as cobro_fecha, c.id is not null as cubierta,
  v.tienda_id
from (
  select m.tienda_id, m.fecha, m.metodo_cobro,
         round(sum(m.total_eur), 2) as ventas,
         coalesce(sum(m.num_pedidos), 0)::int as pedidos
  from public.movimientos m
  join public.categorias cat on cat.id = m.categoria_id
  where m.tipo = 'ingreso' and cat.nombre = 'Ventas Shopify' and m.metodo_cobro is not null
  group by m.tienda_id, m.fecha, m.metodo_cobro
) v
left join lateral (
  select c1.id, c1.fecha_cobro
  from public.cobros_pasarela c1
  where c1.tienda_id = v.tienda_id
    and c1.metodo_cobro = v.metodo_cobro
    and v.fecha between c1.periodo_desde and c1.periodo_hasta
  order by c1.fecha_cobro desc
  limit 1
) c on true;

create or replace function public.fn_ventas_registradas(
  p_tienda uuid, p_desde date, p_hasta date, p_metodo text
)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(round(sum(m.total_eur), 2), 0)
  from public.movimientos m
  join public.categorias cat on cat.id = m.categoria_id
  where m.tipo = 'ingreso'
    and cat.nombre = 'Ventas Shopify'
    and m.tienda_id = p_tienda
    and m.metodo_cobro = p_metodo
    and m.fecha between p_desde and p_hasta;
$$;

create or replace function public.fn_cobros_solapados(
  p_tienda uuid, p_plataforma text, p_desde date, p_hasta date, p_referencia text
)
returns table (
  id uuid, fecha_cobro date, periodo_desde date, periodo_hasta date,
  importe_bruto numeric, referencia text, motivo text
)
language sql
stable
set search_path = public
as $$
  select c.id, c.fecha_cobro, c.periodo_desde, c.periodo_hasta,
         c.importe_bruto, c.referencia,
         case
           when nullif(trim(p_referencia), '') is not null
                and c.referencia = trim(p_referencia) then 'referencia'
           else 'periodo'
         end
  from public.cobros_pasarela c
  where c.tienda_id = p_tienda
    and c.plataforma = p_plataforma
    and (
      (c.periodo_desde <= p_hasta and c.periodo_hasta >= p_desde)
      or (nullif(trim(p_referencia), '') is not null and c.referencia = trim(p_referencia))
    )
  order by c.fecha_cobro desc;
$$;

create or replace function public.fn_registrar_ventas_dia(
  p_tienda          uuid,
  p_fecha           date,
  p_divisa          text,
  p_tasa            numeric,
  p_shopify_importe numeric,
  p_shopify_pedidos int,
  p_paypal_importe  numeric,
  p_paypal_pedidos  int,
  p_sobrescribir    boolean
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor      uuid := auth.uid();
  v_categoria  uuid;
  v_tasa       numeric;
  v_existentes jsonb;
  v_metodo     text;
  v_etiqueta   text;
  v_importe    numeric;
  v_pedidos    int;
  v_fila       record;
  v_primero    uuid;
  v_ajeno      text;
  v_creados    int := 0;
  v_cambiados  int := 0;
  v_borrados   int := 0;
  v_n          int;
  v_estado     text;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  select estado into v_estado from public.tiendas where id = p_tienda;
  if v_estado is null then
    raise exception 'Elige una tienda para registrar las ventas del día.';
  end if;
  if v_estado = 'archivada' then
    raise exception 'La tienda está archivada: no admite ventas nuevas.';
  end if;

  if coalesce(p_divisa, 'EUR') not in ('EUR', 'USD') then
    raise exception 'La divisa tiene que ser EUR o USD.';
  end if;
  v_tasa := case when coalesce(p_divisa, 'EUR') = 'EUR' then 1 else p_tasa end;
  if v_tasa is null or v_tasa <= 0 then
    raise exception 'La tasa de cambio tiene que ser mayor que cero.';
  end if;

  if coalesce(p_shopify_importe, 0) < 0 or coalesce(p_paypal_importe, 0) < 0
     or coalesce(p_shopify_pedidos, 0) < 0 or coalesce(p_paypal_pedidos, 0) < 0 then
    raise exception 'Ni los importes ni los pedidos pueden ser negativos.';
  end if;

  if coalesce(p_shopify_importe, 0) = 0 and coalesce(p_paypal_importe, 0) = 0 then
    raise exception 'Escribe las ventas del día de al menos un método de cobro.';
  end if;

  if coalesce(p_shopify_importe, 0) = 0 and coalesce(p_shopify_pedidos, 0) > 0 then
    raise exception 'Hay pedidos de Shopify Payments sin importe.';
  end if;
  if coalesce(p_paypal_importe, 0) = 0 and coalesce(p_paypal_pedidos, 0) > 0 then
    raise exception 'Hay pedidos de PayPal sin importe.';
  end if;

  select id into v_categoria
  from public.categorias where nombre = 'Ventas Shopify' and tipo = 'ingreso';
  if v_categoria is null then
    raise exception 'No existe la categoría «Ventas Shopify». Es una categoría de sistema: revisa /categorias.';
  end if;

  -- Lo que ya hay ese día EN ESTA TIENDA.
  select coalesce(jsonb_agg(jsonb_build_object(
           'metodo', m.metodo_cobro,
           'importe', m.total,
           'pedidos', m.num_pedidos) order by m.metodo_cobro), '[]'::jsonb)
    into v_existentes
  from public.movimientos m
  where m.fecha = p_fecha and m.categoria_id = v_categoria
    and m.tienda_id = p_tienda
    and m.tipo = 'ingreso' and m.num_pedidos is not null;

  if jsonb_array_length(v_existentes) > 0 and not coalesce(p_sobrescribir, false) then
    return jsonb_build_object('duplicado', true, 'existentes', v_existentes);
  end if;

  foreach v_metodo in array array['shopify_payments', 'paypal'] loop
    if v_metodo = 'shopify_payments' then
      v_importe := round(coalesce(p_shopify_importe, 0), 2);
      v_pedidos := coalesce(p_shopify_pedidos, 0);
      v_etiqueta := 'Shopify Payments';
    else
      v_importe := round(coalesce(p_paypal_importe, 0), 2);
      v_pedidos := coalesce(p_paypal_pedidos, 0);
      v_etiqueta := 'PayPal';
    end if;

    v_primero := null;

    for v_fila in
      select m.id, m.total, m.num_pedidos, m.divisa, m.tasa_cambio, m.created_by,
             p.nombre as autor
      from public.movimientos m
      left join public.profiles p on p.id = m.created_by
      where m.fecha = p_fecha and m.categoria_id = v_categoria
        and m.tienda_id = p_tienda
        and m.tipo = 'ingreso' and m.num_pedidos is not null
        and m.metodo_cobro = v_metodo
      order by m.created_at
    loop
      if v_primero is null and v_importe > 0
         and v_fila.total = v_importe and v_fila.num_pedidos = v_pedidos
         and v_fila.divisa = coalesce(p_divisa, 'EUR') and v_fila.tasa_cambio = v_tasa then
        v_primero := v_fila.id;
        continue;
      end if;

      if v_fila.created_by <> v_actor then
        v_ajeno := coalesce(v_fila.autor, 'el otro socio');
        raise exception
          'Las ventas de % del % las registró %. Solo él puede sustituirlas.',
          v_etiqueta, to_char(p_fecha, 'DD/MM/YYYY'), v_ajeno;
      end if;

      if v_primero is null and v_importe > 0 then
        update public.movimientos
           set concepto       = 'Ventas del ' || to_char(p_fecha, 'DD/MM/YYYY') || ' · ' || v_etiqueta,
               divisa         = coalesce(p_divisa, 'EUR'),
               base_imponible = v_importe,
               iva_tipo       = 0,
               iva_importe    = 0,
               total          = v_importe,
               tasa_cambio    = v_tasa,
               num_pedidos    = v_pedidos
         where id = v_fila.id;
        get diagnostics v_n = row_count;
        v_cambiados := v_cambiados + v_n;
        v_primero := v_fila.id;
      else
        delete from public.movimientos where id = v_fila.id;
        get diagnostics v_n = row_count;
        v_borrados := v_borrados + v_n;
      end if;
    end loop;

    if v_primero is null and v_importe > 0 then
      insert into public.movimientos (
        tipo, fecha, concepto, categoria_id, divisa,
        base_imponible, iva_tipo, iva_importe, total,
        tasa_cambio, total_eur, base_eur,
        anticipado_por, num_pedidos, metodo_cobro, tienda_id, created_by
      )
      values (
        'ingreso', p_fecha,
        'Ventas del ' || to_char(p_fecha, 'DD/MM/YYYY') || ' · ' || v_etiqueta,
        v_categoria, coalesce(p_divisa, 'EUR'),
        v_importe, 0, 0, v_importe,
        v_tasa, round(v_importe * v_tasa, 2), round(v_importe * v_tasa, 2),
        null, v_pedidos, v_metodo, p_tienda, v_actor
      );
      v_creados := v_creados + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'duplicado', false,
    'creados', v_creados,
    'actualizados', v_cambiados,
    'borrados', v_borrados);
end;
$$;

create or replace function public.fn_importar_movimientos(
  p_tienda         uuid,
  p_nombre_archivo text,
  p_origen         text,
  p_filas          jsonb,
  p_filas_totales  int,
  p_filas_omitidas int
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_importacion uuid;
  v_fila        jsonb;
  v_importe     numeric;
  v_tasa        numeric;
  v_total_eur   numeric := 0;
  v_creados     int := 0;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  if not exists (select 1 from public.tiendas where id = p_tienda and estado <> 'archivada') then
    raise exception 'Elige una tienda activa para importar.';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array'
     or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay ninguna fila que importar.';
  end if;

  if jsonb_array_length(p_filas) > 5000 then
    raise exception 'Máximo 5.000 filas por importación.';
  end if;

  insert into public.importaciones (
    nombre_archivo, origen, filas_totales, filas_omitidas, tienda_id, created_by)
  values (p_nombre_archivo, p_origen, coalesce(p_filas_totales, 0), coalesce(p_filas_omitidas, 0), p_tienda, v_actor)
  returning id into v_importacion;

  for v_fila in select value from jsonb_array_elements(p_filas) loop
    v_importe := round(coalesce((v_fila ->> 'importe')::numeric, 0), 2);
    v_tasa    := coalesce((v_fila ->> 'tasa_cambio')::numeric, 1);

    if v_importe <= 0 then
      raise exception 'Una de las filas tiene importe cero o negativo: %', v_fila;
    end if;

    insert into public.movimientos (
      tipo, fecha, concepto, categoria_id, divisa,
      base_imponible, iva_tipo, iva_importe, total,
      tasa_cambio, total_eur, base_eur,
      num_pedidos, notas, tienda_id, created_by, importacion_id
    )
    values (
      coalesce(v_fila ->> 'tipo', 'ingreso'),
      (v_fila ->> 'fecha')::date,
      coalesce(nullif(trim(v_fila ->> 'concepto'), ''), 'Importado'),
      (v_fila ->> 'categoria_id')::uuid,
      coalesce(v_fila ->> 'divisa', 'EUR'),
      v_importe, 0, 0, v_importe,
      v_tasa, round(v_importe * v_tasa, 2), round(v_importe * v_tasa, 2),
      nullif(v_fila ->> 'num_pedidos', '')::int,
      'Importado desde ' || p_nombre_archivo,
      p_tienda, v_actor, v_importacion
    );

    v_total_eur := v_total_eur + round(v_importe * v_tasa, 2);
    v_creados := v_creados + 1;
  end loop;

  update public.importaciones
     set filas_importadas = v_creados,
         importe_total_eur = round(v_total_eur, 2)
   where id = v_importacion;

  return jsonb_build_object(
    'importacion_id', v_importacion,
    'creados', v_creados,
    'importe_total_eur', round(v_total_eur, 2)
  );
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 7. TESORERÍA (global) Y CUPO DE LA TARJETA
-- ───────────────────────────────────────────────────────────────────────────

-- Igual que en la 0017, con dos cambios: los gastos se reparten por
-- medio_pago, y una venta solo la cubre un cobro de su misma tienda.
create or replace function public.fn_tesoreria(p_fecha_corte date default current_date)
returns table (
  saldo_inicial_banco numeric, fecha_inicial_banco date,
  saldo_inicial_paypal numeric, fecha_inicial_paypal date,
  cobrado_shopify numeric, cobrado_paypal numeric,
  traspasos_salida numeric, traspasos_entrada numeric,
  gastos_banco numeric, gastos_paypal numeric,
  reembolsos_banco numeric, reembolsos_paypal numeric,
  saldo_banco numeric, saldo_paypal numeric, caja_total numeric,
  ventas_shopify numeric, ventas_paypal numeric,
  pendiente_shopify numeric, pendiente_paypal numeric, pendiente_total numeric
)
language sql
stable
set search_path = public
as $$
  with
  b as (
    select
      coalesce((select (valor ->> 'importe')::numeric from public.ajustes where clave = 'saldo_inicial'), 0) as importe,
      coalesce((select (valor ->> 'fecha')::date      from public.ajustes where clave = 'saldo_inicial'), p_fecha_corte) as desde
  ),
  pp as (
    select
      coalesce((select (valor ->> 'importe')::numeric from public.ajustes where clave = 'saldo_inicial_paypal'), 0) as importe,
      coalesce((select (valor ->> 'fecha')::date      from public.ajustes where clave = 'saldo_inicial_paypal'),
               (select desde from b)) as desde
  ),
  generados as (
    select movimiento_comision_id as id from public.cobros_pasarela where movimiento_comision_id is not null
    union all
    select movimiento_devolucion_id from public.cobros_pasarela where movimiento_devolucion_id is not null
    union all
    select movimiento_comision_id from public.traspasos_paypal where movimiento_comision_id is not null
  ),
  cobros as (
    select
      coalesce(sum(c.importe_neto) filter (
        where c.metodo_cobro = 'shopify_payments'
          and c.fecha_cobro >= (select desde from b)), 0) as shopify,
      coalesce(sum(c.importe_neto) filter (
        where c.metodo_cobro = 'paypal'
          and c.fecha_cobro >= (select desde from pp)), 0) as paypal
    from public.cobros_pasarela c
    where c.fecha_cobro <= p_fecha_corte
  ),
  tras as (
    select
      coalesce(sum(t.importe)      filter (where t.fecha >= (select desde from pp)), 0) as salida,
      coalesce(sum(t.importe_neto) filter (where t.fecha >= (select desde from b)),  0) as entrada
    from public.traspasos_paypal t
    where t.fecha <= p_fecha_corte
  ),
  gastos as (
    select
      coalesce(sum(m.total_eur) filter (
        where m.medio_pago = 'banco' and m.fecha >= (select desde from b)), 0) as banco,
      coalesce(sum(m.total_eur) filter (
        where m.medio_pago = 'paypal' and m.fecha >= (select desde from pp)), 0) as paypal
    from public.movimientos m
    where m.tipo = 'gasto'
      and m.medio_pago in ('banco', 'paypal')
      and m.fecha <= p_fecha_corte
      and m.id not in (select id from generados)
  ),
  reemb as (
    select
      coalesce(sum(r.importe_eur) filter (
        where r.cuenta_pago = 'banco' and r.fecha >= (select desde from b)), 0) as banco,
      coalesce(sum(r.importe_eur) filter (
        where r.cuenta_pago = 'paypal' and r.fecha >= (select desde from pp)), 0) as paypal
    from public.reembolsos r
    where r.fecha <= p_fecha_corte
  ),
  ventas as (
    select
      m.metodo_cobro,
      m.fecha,
      sum(m.total_eur) as importe,
      exists (
        select 1 from public.cobros_pasarela c
        where c.tienda_id = m.tienda_id
          and c.metodo_cobro = m.metodo_cobro
          and c.fecha_cobro <= p_fecha_corte
          and m.fecha between c.periodo_desde and c.periodo_hasta
      ) as cubierta
    from public.movimientos m
    join public.categorias cat on cat.id = m.categoria_id
    where m.tipo = 'ingreso'
      and cat.nombre = 'Ventas Shopify'
      and m.metodo_cobro is not null
      and m.fecha <= p_fecha_corte
      and m.fecha >= case when m.metodo_cobro = 'paypal'
                          then (select desde from pp) else (select desde from b) end
    group by m.tienda_id, m.metodo_cobro, m.fecha
  ),
  pend as (
    select
      coalesce(sum(importe) filter (where metodo_cobro = 'shopify_payments'), 0) as ventas_shopify,
      coalesce(sum(importe) filter (where metodo_cobro = 'paypal'), 0)           as ventas_paypal,
      coalesce(sum(importe) filter (where metodo_cobro = 'shopify_payments' and not cubierta), 0) as shopify,
      coalesce(sum(importe) filter (where metodo_cobro = 'paypal' and not cubierta), 0)           as paypal
    from ventas
  ),
  saldos as (
    select
      round(b.importe + cobros.shopify + tras.entrada - gastos.banco - reemb.banco, 2)   as banco,
      round(pp.importe + cobros.paypal - tras.salida - gastos.paypal - reemb.paypal, 2) as paypal
    from b, pp, cobros, tras, gastos, reemb
  )
  select
    round(b.importe, 2), b.desde,
    round(pp.importe, 2), pp.desde,
    round(cobros.shopify, 2), round(cobros.paypal, 2),
    round(tras.salida, 2), round(tras.entrada, 2),
    round(gastos.banco, 2), round(gastos.paypal, 2),
    round(reemb.banco, 2), round(reemb.paypal, 2),
    saldos.banco, saldos.paypal, round(saldos.banco + saldos.paypal, 2),
    round(pend.ventas_shopify, 2), round(pend.ventas_paypal, 2),
    round(pend.shopify, 2), round(pend.paypal, 2), round(pend.shopify + pend.paypal, 2)
  from b, pp, cobros, tras, gastos, reemb, pend, saldos;
$$;

-- 7.1 El cupo deja de filtrar por categoría: mide la tarjeta.
update public.ajustes
   set valor = valor - 'categoria_ids' - 'categoria_id'
 where clave = 'limite_aportacion';

create or replace view public.vw_anticipos_socio
with (security_invoker = true) as
with anticipado as (
  select
    m.anticipado_por                as socio_id,
    round(sum(m.total_eur), 2)      as anticipado,
    round(coalesce(sum(m.total_eur) filter (where m.medio_pago = 'tarjeta_daniel'), 0), 2) as anticipado_cupo,
    round(coalesce(sum(m.total_eur) filter (where m.medio_pago is distinct from 'tarjeta_daniel'), 0), 2) as anticipado_otros,
    count(*)                        as num_anticipos
  from public.movimientos m
  where m.tipo = 'gasto' and m.anticipado_por is not null
  group by m.anticipado_por
),
reembolsado as (
  select
    m.anticipado_por                   as socio_id,
    round(sum(rm.importe_eur), 2)      as reembolsado
  from public.reembolso_movimientos rm
  join public.movimientos m on m.id = rm.movimiento_id
  where m.anticipado_por is not null
  group by m.anticipado_por
)
select
  p.id                                          as socio_id,
  p.nombre,
  p.color,
  coalesce(a.anticipado, 0)                     as anticipado,
  coalesce(a.anticipado_cupo, 0)                as anticipado_cupo,
  coalesce(a.anticipado_otros, 0)               as anticipado_otros,
  coalesce(r.reembolsado, 0)                    as reembolsado,
  round(coalesce(a.anticipado, 0) - coalesce(r.reembolsado, 0), 2) as pendiente,
  coalesce(a.num_anticipos, 0)::int             as num_anticipos
from public.profiles p
left join anticipado a on a.socio_id = p.id
left join reembolsado r on r.socio_id = p.id
where p.activo = true;

comment on view public.vw_anticipos_socio is
  'Por socio: cuánto ha puesto, cuánto se le ha devuelto y cuánto se le debe (R2). '
  'Global: suma todas las tiendas y General. `anticipado_cupo` es lo pagado con la '
  'tarjeta (R6) y `anticipado_otros`, lo pagado de bolsillo.';

drop function if exists public.fn_categorias_limite();

create or replace view public.vw_anticipos_pendientes
with (security_invoker = true) as
select
  m.id, m.fecha, m.concepto, c.nombre as categoria,
  m.anticipado_por as socio_id, p.nombre as socio, p.color as socio_color,
  m.total_eur,
  round(coalesce(rm.cubierto, 0), 2) as reembolsado_eur,
  round(m.total_eur - coalesce(rm.cubierto, 0), 2) as pendiente_eur,
  m.tienda_id,
  coalesce(t.nombre, 'General / Sociedad') as tienda,
  t.color as tienda_color,
  m.medio_pago
from public.movimientos m
join public.categorias c on c.id = m.categoria_id
join public.profiles p on p.id = m.anticipado_por
left join public.tiendas t on t.id = m.tienda_id
left join (
  select movimiento_id, sum(importe_eur) as cubierto
  from public.reembolso_movimientos group by movimiento_id
) rm on rm.movimiento_id = m.id
where m.tipo = 'gasto' and m.anticipado_por is not null
  and (m.total_eur - coalesce(rm.cubierto, 0)) > 0;

create or replace view public.vw_cuentas_coste
with (security_invoker = true) as
with tasa as (
  select tasa_a_eur from public.tipos_cambio
  where divisa = 'USD' order by fecha desc limit 1
)
select
  c.id, c.nombre, c.tipo, c.email_asociado, c.url, c.titular_id, c.coste, c.divisa,
  c.periodicidad, c.fecha_renovacion, c.estado, c.notas, c.created_at, c.updated_at,
  c.categoria_gasto_id, c.aviso_dias, c.ultimo_pago, c.created_by,
  p.nombre as titular_nombre,
  p.color as titular_color,
  cat.nombre as categoria_nombre,
  coalesce((select tasa_a_eur from tasa), 1) as tasa_aplicada,
  (select tasa_a_eur from tasa) is not null as hay_tasa,
  round(coalesce(c.coste, 0)
        * case when c.divisa = 'USD' then coalesce((select tasa_a_eur from tasa), 1) else 1 end, 2) as coste_eur,
  round(case lower(coalesce(c.periodicidad, ''))
          when 'mensual' then coalesce(c.coste, 0)
          when 'anual'   then coalesce(c.coste, 0) / 12.0
          else 0
        end
        * case when c.divisa = 'USD' then coalesce((select tasa_a_eur from tasa), 1) else 1 end, 2) as coste_mensual_eur,
  case when c.fecha_renovacion is null then null else c.fecha_renovacion - current_date end as dias_para_renovar,
  case when c.fecha_renovacion is null or c.estado <> 'activa' then false
       else c.fecha_renovacion < current_date end as vencida,
  case when c.fecha_renovacion is null or c.estado <> 'activa' then false
       else c.fecha_renovacion >= current_date
            and c.fecha_renovacion <= current_date + coalesce(c.aviso_dias, 7) end as renueva_pronto,
  c.tienda_id
from public.cuentas_activos c
left join public.profiles p on p.id = c.titular_id
left join public.categorias cat on cat.id = c.categoria_gasto_id;

-- 7.2 Cupo de la tarjeta: global, igual se mire desde donde se mire.
create or replace function public.fn_cupo_tarjeta()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_limite    numeric;
  v_socio     uuid;
  v_nombre    text;
  v_aviso     numeric;
  v_consumido numeric;
  v_num       int;
  v_por       jsonb;
begin
  select coalesce((valor ->> 'importe')::numeric, 0), nullif(valor ->> 'socio_id', '')::uuid
    into v_limite, v_socio
  from public.ajustes where clave = 'limite_aportacion';

  select coalesce((valor ->> 'porcentaje')::numeric, 80) into v_aviso
  from public.ajustes where clave = 'aviso_limite_pct';

  select nombre into v_nombre from public.profiles where id = v_socio;

  select round(coalesce(sum(m.total_eur), 0), 2), count(*)::int
    into v_consumido, v_num
  from public.movimientos m
  where m.tipo = 'gasto' and m.medio_pago = 'tarjeta_daniel';

  select coalesce(jsonb_agg(jsonb_build_object(
           'tienda_id', x.tienda_id,
           'nombre', coalesce(t.nombre, 'General / Sociedad'),
           'color', t.color,
           'consumido', x.consumido,
           'num', x.num) order by x.consumido desc), '[]'::jsonb)
    into v_por
  from (
    select m.tienda_id, round(sum(m.total_eur), 2) as consumido, count(*)::int as num
    from public.movimientos m
    where m.tipo = 'gasto' and m.medio_pago = 'tarjeta_daniel'
    group by m.tienda_id
  ) x
  left join public.tiendas t on t.id = x.tienda_id;

  return jsonb_build_object(
    'limite',       coalesce(v_limite, 0),
    'socio_id',     v_socio,
    'socio_nombre', v_nombre,
    'aviso_pct',    coalesce(v_aviso, 80),
    'consumido',    v_consumido,
    'disponible',   round(coalesce(v_limite, 0) - v_consumido, 2),
    'pct',          case when coalesce(v_limite, 0) > 0
                         then round(v_consumido / v_limite * 100, 1) end,
    'num_gastos',   v_num,
    'por_tienda',   v_por
  );
end;
$$;

comment on function public.fn_cupo_tarjeta() is
  'Cupo de la tarjeta de crédito (R6): gastos con medio_pago = tarjeta_daniel de '
  'todas las tiendas y de General, contra ajustes.limite_aportacion.importe.';


-- ───────────────────────────────────────────────────────────────────────────
-- 8. REALTIME: el widget del cupo se entera de cualquier gasto nuevo
-- ───────────────────────────────────────────────────────────────────────────
-- Realtime respeta la RLS: solo los socios activos reciben eventos.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'movimientos') then
    alter publication supabase_realtime add table public.movimientos;
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 9. PERMISOS
-- ───────────────────────────────────────────────────────────────────────────

revoke all on public.vw_libro_gestoria       from anon;
revoke all on public.vw_cobros_conciliacion  from anon;
revoke all on public.vw_ventas_cobertura     from anon;
revoke all on public.vw_anticipos_socio      from anon;
revoke all on public.vw_anticipos_pendientes from anon;
revoke all on public.vw_cuentas_coste        from anon;
grant select on public.vw_libro_gestoria, public.vw_cobros_conciliacion, public.vw_ventas_cobertura,
                public.vw_anticipos_socio, public.vw_anticipos_pendientes, public.vw_cuentas_coste
  to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.fn_socio_tarjeta()',
    'public.normalizar_medio_pago()',
    'public.fn_cobro_sincronizar_gasto(uuid, numeric, text, text, date, uuid, text, uuid)',
    'public.cobros_generar_gastos()',
    'public.traspasos_generar_gasto()',
    'public.fn_registrar_pago_cuenta(uuid, date, numeric, uuid)',
    'public.fn_en_ambito(uuid, uuid, boolean)',
    'public.fn_resumen_periodo(date, date, uuid, boolean)',
    'public.fn_resumen_diario(uuid, boolean)',
    'public.fn_resumen_mensual(uuid, boolean)',
    'public.fn_gastos_categoria(uuid, boolean)',
    'public.fn_comparativa_tiendas(date, date)',
    'public.fn_resumen_iva(date, date, uuid, boolean)',
    'public.fn_ventas_registradas(uuid, date, date, text)',
    'public.fn_cobros_solapados(uuid, text, date, date, text)',
    'public.fn_registrar_ventas_dia(uuid, date, text, numeric, numeric, int, numeric, int, boolean)',
    'public.fn_importar_movimientos(uuid, text, text, jsonb, int, int)',
    'public.fn_tesoreria(date)',
    'public.fn_cupo_tarjeta()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 10. FOTO DE DESPUÉS Y COMPROBACIÓN AL CÉNTIMO
-- ───────────────────────────────────────────────────────────────────────────

create or replace function pg_temp.foto_nueva(p_tienda uuid)
returns jsonb language plpgsql as $$
declare v_foto jsonb;
begin
  select pg_temp.foto_comun(p_tienda) || jsonb_build_object(
    'resumen',    (select to_jsonb(r) from public.fn_resumen_periodo('2000-01-01', '2100-12-31', p_tienda, false) r),
    'mensual',    (select coalesce(jsonb_agg(to_jsonb(v) order by v.mes), '[]') from public.fn_resumen_mensual(p_tienda, false) v),
    'diario',     (select coalesce(jsonb_agg(to_jsonb(v) order by v.fecha), '[]') from public.fn_resumen_diario(p_tienda, false) v),
    'categorias', (select coalesce(jsonb_agg(to_jsonb(v) order by v.mes, v.categoria_id), '[]') from public.fn_gastos_categoria(p_tienda, false) v),
    'iva',        public.fn_resumen_iva('2000-01-01', '2100-12-31', p_tienda, false),
    'conciliacion', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', c.id, 'ventas', c.ventas_registradas, 'diferencia', c.diferencia,
                      'cuadra', c.cuadra, 'solapados', c.solapados) order by c.id), '[]')
                    from public.vw_cobros_conciliacion c
                    where p_tienda is null or c.tienda_id = p_tienda),
    'cobertura',  (select coalesce(jsonb_agg(jsonb_build_object(
                      'fecha', v.fecha, 'metodo', v.metodo_cobro, 'ventas', v.ventas,
                      'pedidos', v.pedidos, 'cobro', v.cobro_id) order by v.fecha, v.metodo_cobro), '[]')
                    from public.vw_ventas_cobertura v
                    where p_tienda is null or v.tienda_id = p_tienda),
    'filas', jsonb_build_object(
      'movimientos', (select count(*) from public.movimientos m where public.fn_en_ambito(m.tienda_id, p_tienda, false)),
      'total_eur',   (select coalesce(sum(total_eur), 0) from public.movimientos m where public.fn_en_ambito(m.tienda_id, p_tienda, false)),
      'cobros',      (select count(*) from public.cobros_pasarela c where p_tienda is null or c.tienda_id = p_tienda),
      'cuentas',     (select count(*) from public.cuentas_activos c where public.fn_en_ambito(c.tienda_id, p_tienda, false)),
      'notas',       (select count(*) from public.notas n where public.fn_en_ambito(n.tienda_id, p_tienda, false)))
  ) into v_foto;
  return v_foto;
end $$;

insert into _foto_0018
select 'despues_tienda', pg_temp.foto_nueva(id) from public.tiendas where slug = 'theglowcospain';
insert into _foto_0018
select 'despues_todas', pg_temp.foto_nueva(null);

do $$
declare
  v_antes  jsonb := (select datos from _foto_0018 where momento = 'antes');
  v_tienda jsonb := (select datos from _foto_0018 where momento = 'despues_tienda');
  v_todas  jsonb := (select datos from _foto_0018 where momento = 'despues_todas');
  v_mal    text;
begin
  select string_agg(k, ', ') into v_mal
  from jsonb_object_keys(v_antes) k
  where v_antes -> k is distinct from v_tienda -> k
     or v_antes -> k is distinct from v_todas -> k;

  if v_mal is not null then
    raise exception 'La 0018 cambia cifras en: %. No se aplica nada.', v_mal;
  end if;

  if exists (select 1 from public.movimientos where tienda_id is null)
     or exists (select 1 from public.movimientos where tipo = 'gasto' and medio_pago is null) then
    raise exception 'Quedan movimientos sin tienda o gastos sin medio de pago.';
  end if;
end $$;
-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Retira la compatibilidad con la app anterior a la multi-tienda
--
-- Se aplica SOLO cuando la app nueva está desplegada y verificada en
-- producción. Hasta entonces la 0018 mantenía, para la versión vieja:
--   · la columna movimientos.cuenta_pago (sustituida por medio_pago);
--   · las vistas y funciones sin tienda (vw_resumen_*, vw_gastos_categoria y
--     las firmas antiguas de fn_resumen_periodo, fn_resumen_iva,
--     fn_ventas_registradas, fn_cobros_solapados, fn_registrar_ventas_dia y
--     fn_importar_movimientos);
--   · TheGlowCoSpain como tienda por defecto de lo que se creaba sin tienda;
--   · el ajuste objetivo_mes (ahora vive en cada tienda).
--
-- No cambia ningún importe: solo borra lo que ya nadie usa.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Vistas y firmas antiguas.
drop view if exists public.vw_resumen_diario;
drop view if exists public.vw_resumen_mensual;
drop view if exists public.vw_gastos_categoria;

drop function if exists public.fn_resumen_periodo(date, date);
drop function if exists public.fn_resumen_iva(date, date);
drop function if exists public.fn_ventas_registradas(date, date, text);
drop function if exists public.fn_cobros_solapados(text, date, date, text);
drop function if exists public.fn_registrar_ventas_dia(date, text, numeric, numeric, int, numeric, int, boolean);
drop function if exists public.fn_importar_movimientos(text, text, jsonb, int, int);

-- 2. Sin tienda por defecto: lo que llega sin tienda es de General (y un
--    ingreso sin tienda lo rechaza la restricción movimientos_ingreso_con_tienda).
alter table public.movimientos        alter column tienda_id drop default;
alter table public.cobros_pasarela    alter column tienda_id drop default;
alter table public.importaciones      alter column tienda_id drop default;
alter table public.mapeos_importacion alter column tienda_id drop default;
alter table public.cuentas_activos    alter column tienda_id drop default;
alter table public.notas              alter column tienda_id drop default;

-- 3. El trigger, sin la traducción desde cuenta_pago.
create or replace function public.normalizar_medio_pago()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_socio uuid;
begin
  if new.tienda_id is not null
     and (tg_op = 'INSERT' or new.tienda_id is distinct from old.tienda_id)
     and exists (select 1 from public.tiendas t where t.id = new.tienda_id and t.estado = 'archivada') then
    raise exception 'La tienda está archivada: no admite movimientos nuevos.';
  end if;

  if new.tipo = 'ingreso' then
    new.medio_pago := null;
    if new.metodo_cobro is null and exists (
      select 1 from public.categorias c
       where c.id = new.categoria_id and c.nombre = 'Ventas Shopify'
    ) then
      new.metodo_cobro := 'shopify_payments';
    end if;
    return new;
  end if;

  new.metodo_cobro := null;

  -- Sin medio (importación, inventario de cuentas): se deduce.
  if new.medio_pago is null then
    new.medio_pago := case when new.anticipado_por is not null then 'bolsillo' else 'banco' end;
  end if;

  if new.medio_pago = 'tarjeta_daniel' then
    v_socio := public.fn_socio_tarjeta();
    if v_socio is null then
      raise exception 'No hay ningún socio asignado a la tarjeta (ajuste «limite_aportacion»).';
    end if;
    new.anticipado_por := v_socio;
  elsif new.medio_pago = 'bolsillo' then
    if new.anticipado_por is null then
      raise exception 'Un gasto pagado de bolsillo necesita saber qué socio lo adelantó.';
    end if;
  else
    new.anticipado_por := null;
  end if;

  if tg_op = 'UPDATE' and new.anticipado_por is distinct from old.anticipado_por
     and exists (select 1 from public.reembolso_movimientos rm where rm.movimiento_id = old.id) then
    raise exception
      'Este gasto ya tiene reembolsos aplicados: no se puede cambiar quién lo pagó. '
      'Anula antes el reembolso en /liquidacion.';
  end if;

  return new;
end;
$$;

-- 4. La columna vieja.
alter table public.movimientos drop column if exists cuenta_pago;

-- 5. Los objetivos ya están en cada tienda.
delete from public.ajustes where clave = 'objetivo_mes';
select (select to_jsonb(r) from fn_resumen_periodo('2000-01-01','2100-12-31',null,false) r) resumen, (select caja_total from fn_tesoreria()) caja, (select to_regclass('public.vw_resumen_mensual')) vista_vieja, (select count(*) from information_schema.columns where table_name='movimientos' and column_name='cuenta_pago') cuenta_pago, fn_cupo_tarjeta() cupo; rollback;
