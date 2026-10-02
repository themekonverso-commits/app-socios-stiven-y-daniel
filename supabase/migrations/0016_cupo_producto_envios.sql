-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — El cupo de la tarjeta cuenta también producto y envíos
--
-- La tarjeta de 3.000 € de la regla 6 no se usa solo para anuncios: con ella
-- se paga también el producto a CJ / al proveedor y su envío. Hasta ahora el
-- cupo solo restaba Publicidad (0011), así que la barra se quedaba corta
-- respecto a lo que de verdad lleva gastado la tarjeta.
--
-- El ámbito pasa de UNA categoría a una LISTA:
--
--   antes:  {"socio_id": "...", "importe": 3000, "categoria_id": "<Publicidad>"}
--   ahora:  {"socio_id": "...", "importe": 3000,
--            "categoria_ids": ["<Publicidad>", "<Coste de producto>",
--                              "<Envíos y logística>"]}
--
--   · con lista  → el cupo cuenta los anticipos de cualquiera de esas categorías;
--   · sin lista  → se lee el `categoria_id` antiguo, si lo hubiera;
--   · sin nada   → el cupo cuenta todos los anticipos (comportamiento previo).
--
-- LO QUE NO CAMBIA, igual que en la 0011: reembolsos, prorrata y liquidación
-- final siguen operando sobre TODOS los anticipos. El ámbito solo decide qué
-- parte de lo adelantado gasta tarjeta.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. El ámbito del cupo, ahora una lista
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.fn_categorias_limite()
returns uuid[]
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when jsonb_typeof(a.valor->'categoria_ids') = 'array'
         and jsonb_array_length(a.valor->'categoria_ids') > 0
      then array(select jsonb_array_elements_text(a.valor->'categoria_ids')::uuid)
    when nullif(a.valor->>'categoria_id', '') is not null
      then array[(a.valor->>'categoria_id')::uuid]
  end
  from public.ajustes a
  where a.clave = 'limite_aportacion';
$$;

comment on function public.fn_categorias_limite() is
  'Categorías que consumen el cupo de aportación (R6), o null si el cupo cuenta '
  'todos los anticipos. Sale de ajustes.limite_aportacion (categoria_ids, o el '
  'categoria_id antiguo).';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Guardar las tres categorías en el ajuste
--
--    Los ids se buscan por nombre, no se escriben a mano: en cada base de
--    datos son otros. Si falta alguna, se para en seco: un cupo con una
--    categoría de menos daría una barra más baja de lo real sin avisar.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_nombres text[] := array['Publicidad', 'Coste de producto', 'Envíos y logística'];
  v_ids     uuid[];
  v_falta   text;
begin
  select n into v_falta
  from unnest(v_nombres) n
  where not exists (
    select 1 from public.categorias c where c.nombre = n and c.tipo = 'gasto'
  )
  limit 1;

  if v_falta is not null then
    raise exception
      'No existe la categoría de gasto «%». El cupo de la tarjeta se define '
      'sobre ella; revisa las categorías antes de aplicar 0016.', v_falta;
  end if;

  select array_agg(c.id order by array_position(v_nombres, c.nombre))
    into v_ids
  from public.categorias c
  where c.tipo = 'gasto' and c.nombre = any(v_nombres);

  update public.ajustes
  set valor = (valor - 'categoria_id') || jsonb_build_object('categoria_ids', to_jsonb(v_ids))
  where clave = 'limite_aportacion';

  if not found then
    raise exception 'No existe el ajuste «limite_aportacion».';
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. La vista de anticipos, con el ámbito como lista
--
--    Mismas columnas que en la 0011: la aplicación y la liquidación no notan
--    el cambio, solo cambia qué entra en `anticipado_cupo`.
-- ───────────────────────────────────────────────────────────────────────────
drop view if exists public.vw_anticipos_socio;
create view public.vw_anticipos_socio
with (security_invoker = true) as
with ambito as (
  select public.fn_categorias_limite() as categoria_ids
),
anticipado as (
  select
    m.anticipado_por                as socio_id,
    round(sum(m.total_eur), 2)      as anticipado,
    -- Sin ámbito definido, todo entra en el cupo: es el comportamiento previo.
    round(coalesce(sum(m.total_eur) filter (
      where am.categoria_ids is null or m.categoria_id = any(am.categoria_ids)
    ), 0), 2)                       as anticipado_cupo,
    round(coalesce(sum(m.total_eur) filter (
      where am.categoria_ids is not null and not (m.categoria_id = any(am.categoria_ids))
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
  'parte consume el cupo de la tarjeta (R6): publicidad, producto y envíos.';

-- La función de una sola categoría ya no la usa nadie.
drop function if exists public.fn_categoria_limite();


-- ───────────────────────────────────────────────────────────────────────────
-- 4. PERMISOS — explícitos: la vista se ha recreado
-- ───────────────────────────────────────────────────────────────────────────
revoke all on public.vw_anticipos_socio from anon;
grant select on public.vw_anticipos_socio to authenticated;

revoke all on function public.fn_categorias_limite() from public, anon;
grant execute on function public.fn_categorias_limite() to authenticated;
