-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 — El límite de aportación pasa a tener ámbito
--
-- Los 3.000 € de la regla 6 no son «lo máximo que un socio puede adelantar»:
-- son el cupo de una tarjeta de crédito destinada EN EXCLUSIVA a inversión
-- publicitaria. Hasta ahora la barra sumaba cualquier anticipo, así que
-- adelantar la mitad de Shopify o de Klaviyo comía cupo de tarjeta, que es
-- justo lo que no pasa en la realidad.
--
-- A partir de aquí `ajustes.limite_aportacion` lleva un `categoria_id`:
--
--   {"socio_id": "...", "importe": 3000, "categoria_id": "..."}
--
--   · con categoría → el cupo solo cuenta los anticipos de esa categoría;
--   · a null        → se comporta como antes y cuenta todo.
--
-- LO QUE NO CAMBIA: reembolsos, prorrata y liquidación final siguen operando
-- sobre TODOS los anticipos. El contrato no distingue por categoría — todo
-- anticipo justificado da derecho a reembolso — y un gasto fuera del cupo se
-- devuelve igual, solo que no consume tarjeta.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. El ámbito del cupo, en un solo sitio
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.fn_categoria_limite()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(a.valor->>'categoria_id', '')::uuid
  from public.ajustes a
  where a.clave = 'limite_aportacion';
$$;

comment on function public.fn_categoria_limite() is
  'Categoría a la que se limita el cupo de aportación (R6), o null si el cupo '
  'cuenta todos los anticipos. Sale de ajustes.limite_aportacion.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Resolver la categoría «Publicidad» y guardarla en el ajuste
--
--    El id se busca aquí, no se escribe a mano: en cada base de datos es otro.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_categoria uuid;
begin
  select id into v_categoria
  from public.categorias
  where nombre = 'Publicidad' and tipo = 'gasto'
  limit 1;

  if v_categoria is null then
    -- Se para en seco a propósito. Dejar el cupo sin ámbito en silencio sería
    -- volver al comportamiento que esta migración viene a corregir.
    raise exception
      'No existe la categoría de gasto «Publicidad». El cupo de aportación se '
      'define sobre ella; revisa las categorías antes de aplicar 0011.';
  end if;

  update public.ajustes
  set valor = valor || jsonb_build_object('categoria_id', v_categoria)
  where clave = 'limite_aportacion';

  if not found then
    raise exception 'No existe el ajuste «limite_aportacion».';
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. La vista de anticipos, ahora desglosada
--
--    `anticipado` sigue siendo el total y es el que usan reembolsos, prorrata
--    y liquidación final. Las dos columnas nuevas solo sirven para pintar el
--    cupo y el desglose.
-- ───────────────────────────────────────────────────────────────────────────
drop view if exists public.vw_anticipos_socio;
create view public.vw_anticipos_socio
with (security_invoker = true) as
with ambito as (
  select public.fn_categoria_limite() as categoria_id
),
anticipado as (
  select
    m.anticipado_por                as socio_id,
    round(sum(m.total_eur), 2)      as anticipado,
    -- Sin ámbito definido, todo entra en el cupo: es el comportamiento previo.
    round(coalesce(sum(m.total_eur) filter (
      where am.categoria_id is null or m.categoria_id = am.categoria_id
    ), 0), 2)                       as anticipado_cupo,
    round(coalesce(sum(m.total_eur) filter (
      where am.categoria_id is not null and m.categoria_id is distinct from am.categoria_id
    ), 0), 2)                       as anticipado_otros,
    count(*)                        as num_anticipos
  from public.movimientos m
  cross join ambito am
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
  'Por socio: cuánto ha puesto de su bolsillo, cuánto se le ha devuelto y '
  'cuánto se le debe (R2). `anticipado` es el total y manda en reembolsos y '
  'liquidación; `anticipado_cupo` y `anticipado_otros` solo desglosan qué '
  'parte consume el cupo de la tarjeta (R6).';
