-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — Vistas y funciones de agregación para el dashboard
--
-- REGLA INNEGOCIABLE: todo se calcula sobre `total_eur`, nunca sobre `total`.
-- `total` está en la divisa original; sumar euros con dólares da cifras falsas.
--
-- Todo agrega en Postgres. El cliente nunca recibe filas sueltas para sumarlas
-- en JavaScript.
--
-- `security_invoker = true` en las vistas: sin eso, una vista la ejecuta su
-- propietario (postgres) y SALTARÍA la RLS de las tablas base, enseñando datos
-- a quien no debe. Con invoker, la vista se ejecuta como quien consulta y las
-- políticas de `movimientos` y `categorias` siguen aplicando.
--
-- Convención de «no hay datos»: NULL, nunca 0. La interfaz pinta un guion
-- cuando recibe NULL, y un 0,00 € solo cuando el dato real es cero.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Resumen por día ─────────────────────────────────────────────────────
-- Además de las columnas del plan lleva gasto_ads, impresiones y clicks, que
-- alimentan el bloque de rendimiento publicitario sin una consulta aparte.
drop view if exists public.vw_resumen_diario;
create view public.vw_resumen_diario
with (security_invoker = true) as
select
  m.fecha,
  round(coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0), 2) as ingresos,
  round(coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0), 2)   as gastos,
  round(
    coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0)
    - coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0)
  , 2)                                                                      as beneficio,
  coalesce(sum(m.num_pedidos), 0)::int                                      as pedidos,
  round(
    coalesce(sum(m.total_eur) filter (
      where m.tipo = 'gasto' and c.nombre = 'Publicidad'
    ), 0)
  , 2)                                                                      as gasto_ads,
  coalesce(sum(m.impresiones), 0)::bigint                                   as impresiones,
  coalesce(sum(m.clicks), 0)::int                                           as clicks
from public.movimientos m
join public.categorias c on c.id = m.categoria_id
group by m.fecha;

comment on view public.vw_resumen_diario is
  'Un día por fila. Todos los importes en EUR (total_eur).';


-- ── 2. Resumen por mes ─────────────────────────────────────────────────────
drop view if exists public.vw_resumen_mensual;
create view public.vw_resumen_mensual
with (security_invoker = true) as
with base as (
  select
    date_trunc('month', m.fecha)::date                                        as mes,
    coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0)           as ingresos,
    coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0)             as gastos,
    coalesce(sum(m.total_eur) filter (
      where m.tipo = 'gasto' and c.nombre = 'Publicidad'
    ), 0)                                                                     as gasto_ads,
    coalesce(sum(m.num_pedidos), 0)                                           as pedidos
  from public.movimientos m
  join public.categorias c on c.id = m.categoria_id
  group by 1
)
select
  mes,
  round(ingresos, 2)            as ingresos,
  round(gastos, 2)              as gastos,
  round(ingresos - gastos, 2)   as beneficio,
  -- Sin facturación no hay margen que calcular: NULL, no 0.
  case when ingresos > 0
       then round((ingresos - gastos) / ingresos * 100, 1)
  end                           as margen,
  round(gasto_ads, 2)           as gasto_ads,
  -- Sin inversión publicitaria no hay ROAS: NULL, jamás una división por cero.
  case when gasto_ads > 0
       then round(ingresos / gasto_ads, 1)
  end                           as roas,
  pedidos::int                  as pedidos,
  case when pedidos > 0
       then round(ingresos / pedidos, 2)
  end                           as ticket_medio
from base;

comment on view public.vw_resumen_mensual is
  'Un mes por fila. margen, roas y ticket_medio son NULL cuando su denominador es cero.';


-- ── 3. Gastos por categoría y mes ──────────────────────────────────────────
drop view if exists public.vw_gastos_categoria;
create view public.vw_gastos_categoria
with (security_invoker = true) as
select
  date_trunc('month', m.fecha)::date as mes,
  c.id                               as categoria_id,
  c.nombre                           as categoria,
  round(sum(m.total_eur), 2)         as total
from public.movimientos m
join public.categorias c on c.id = m.categoria_id
where m.tipo = 'gasto'
group by 1, 2, 3;

comment on view public.vw_gastos_categoria is
  'Solo gastos, agrupados por mes y categoría. Alimenta el anillo y las barras apiladas.';


-- ── 4. Totales de un periodo, en una sola fila ─────────────────────────────
-- Evita traerse los días del periodo para sumarlos fuera de la base de datos.
-- SECURITY INVOKER (el valor por defecto): la RLS sigue aplicando.
create or replace function public.fn_resumen_periodo(
  p_desde date,
  p_hasta date
)
returns table (
  ingresos    numeric,
  gastos      numeric,
  beneficio   numeric,
  gasto_ads   numeric,
  pedidos     int,
  impresiones bigint,
  clicks      int
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
  where m.fecha between p_desde and p_hasta;
$$;

comment on function public.fn_resumen_periodo(date, date) is
  'Totales de un periodo en una fila. Cero cuando no hay movimientos; quien decide '
  'si eso se pinta como 0,00 € o como guion es la interfaz, según el KPI.';


-- ── 5. Saldo de caja a día de hoy ──────────────────────────────────────────
-- saldo_inicial + ingresos − gastos, desde la fecha del saldo inicial.
-- No depende del selector de periodo: el disponible es el que es.
create or replace function public.fn_saldo_caja()
returns table (
  saldo_inicial numeric,
  fecha_inicial date,
  ingresos      numeric,
  gastos        numeric,
  saldo         numeric
)
language sql
stable
set search_path = public
as $$
  with ajuste as (
    select
      coalesce((valor ->> 'importe')::numeric, 0)              as importe,
      coalesce((valor ->> 'fecha')::date, current_date)        as desde
    from public.ajustes
    where clave = 'saldo_inicial'
  ),
  -- Si aún no existe la fila de ajustes, se parte de cero desde hoy.
  base as (
    select
      coalesce((select importe from ajuste), 0) as importe,
      coalesce((select desde from ajuste), current_date) as desde
  ),
  mov as (
    select
      coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0) as ingresos,
      coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0)   as gastos
    from public.movimientos m, base b
    where m.fecha >= b.desde and m.fecha <= current_date
  )
  select
    round(b.importe, 2),
    b.desde,
    round(mov.ingresos, 2),
    round(mov.gastos, 2),
    round(b.importe + mov.ingresos - mov.gastos, 2)
  from base b, mov;
$$;

comment on function public.fn_saldo_caja() is
  'Saldo disponible hoy. La aplicación no ve el banco: parte del saldo inicial '
  'que se configura en /ajustes.';


-- ── 6. Permisos ────────────────────────────────────────────────────────────
-- El rol anónimo no toca nada, aquí tampoco.
revoke all on public.vw_resumen_diario   from anon;
revoke all on public.vw_resumen_mensual  from anon;
revoke all on public.vw_gastos_categoria from anon;

grant select on public.vw_resumen_diario   to authenticated;
grant select on public.vw_resumen_mensual  to authenticated;
grant select on public.vw_gastos_categoria to authenticated;

revoke all on function public.fn_resumen_periodo(date, date) from public, anon;
revoke all on function public.fn_saldo_caja()                from public, anon;

grant execute on function public.fn_resumen_periodo(date, date) to authenticated;
grant execute on function public.fn_saldo_caja()                to authenticated;
