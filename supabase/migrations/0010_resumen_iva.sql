-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — Resumen de IVA para la gestoría
--
-- Esto acaba en manos de un asesor fiscal, así que la prioridad no es que
-- salga bonito sino que CUADRE.
--
-- DOS DECISIONES QUE SOSTIENEN TODO EL CUADRE:
--
-- 1. La cuota de IVA de cada fila, en euros, se calcula como
--    `total_eur − base_eur`, NO como `round(iva_importe × tasa, 2)`.
--    Las dos formas difieren en un céntimo cuando la divisa no es el euro,
--    porque `total_eur` y `base_eur` se redondearon por separado. Usando la
--    resta, cada fila cumple `base + cuota = total` EXACTAMENTE, y por tanto
--    la suma de los subtotales por tipo cuadra con el total general.
--
-- 2. Los tipos que no son 21, 10, 4 ni 0 no se reparten ni se esconden: van a
--    un grupo «otros». La columna `iva_tipo` no tiene CHECK, así que un 5,5 %
--    es posible. Si se ignorara, el modelo 303 saldría descuadrado y nadie
--    sabría por qué.
--
-- El bloque `cuadre` del resultado compara la suma de los subtotales contra el
-- total general y expone la diferencia. Si algún día no es cero, la interfaz
-- lo enseña en rojo en vez de disimularlo.
-- ═══════════════════════════════════════════════════════════════════════════

-- Suma los subtotales de un bloque y los compara con su total general.
create or replace function public.fn_cuadre_bloque(p_bloque jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_suma_base  numeric := 0;
  v_suma_cuota numeric := 0;
  v_suma_total numeric := 0;
  v_fila       jsonb;
  v_hay_otros  boolean := false;
begin
  for v_fila in select value from jsonb_array_elements(coalesce(p_bloque -> 'por_tipo', '[]'::jsonb)) loop
    v_suma_base  := v_suma_base  + coalesce((v_fila ->> 'base')::numeric, 0);
    v_suma_cuota := v_suma_cuota + coalesce((v_fila ->> 'cuota')::numeric, 0);
    v_suma_total := v_suma_total + coalesce((v_fila ->> 'total')::numeric, 0);
    if v_fila ->> 'tipo_iva' is null then v_hay_otros := true; end if;
  end loop;

  return jsonb_build_object(
    'suma_subtotales_base',  round(v_suma_base, 2),
    'suma_subtotales_cuota', round(v_suma_cuota, 2),
    'suma_subtotales_total', round(v_suma_total, 2),
    'total_general_base',    coalesce((p_bloque ->> 'base')::numeric, 0),
    'total_general_cuota',   coalesce((p_bloque ->> 'cuota')::numeric, 0),
    'total_general_total',   coalesce((p_bloque ->> 'total')::numeric, 0),
    'descuadre_base',  round(v_suma_base  - coalesce((p_bloque ->> 'base')::numeric, 0), 2),
    'descuadre_cuota', round(v_suma_cuota - coalesce((p_bloque ->> 'cuota')::numeric, 0), 2),
    'descuadre_total', round(v_suma_total - coalesce((p_bloque ->> 'total')::numeric, 0), 2),
    'cuadra', (
      round(v_suma_base  - coalesce((p_bloque ->> 'base')::numeric, 0), 2) = 0 and
      round(v_suma_cuota - coalesce((p_bloque ->> 'cuota')::numeric, 0), 2) = 0 and
      round(v_suma_total - coalesce((p_bloque ->> 'total')::numeric, 0), 2) = 0
    ),
    'hay_tipos_no_estandar', v_hay_otros
  );
end;
$$;


create or replace function public.fn_resumen_iva(
  p_desde date,
  p_hasta date
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
      -- Los tipos fuera de los cuatro oficiales se agrupan aparte.
      case when m.iva_tipo in (21, 10, 4, 0) then m.iva_tipo else null end as tipo_iva,
      m.base_eur,
      -- Ver la decisión 1 de la cabecera: la cuota es la diferencia.
      round(m.total_eur - m.base_eur, 2) as cuota_eur,
      m.total_eur
    from public.movimientos m
    where m.fecha between p_desde and p_hasta
  ),
  agregado as (
    select
      tipo,
      tipo_iva,
      count(*)::int              as operaciones,
      round(sum(base_eur), 2)    as base,
      round(sum(cuota_eur), 2)   as cuota,
      round(sum(total_eur), 2)   as total
    from filas
    group by tipo, tipo_iva
  ),
  totales as (
    select
      tipo,
      count(*)::int            as operaciones,
      round(sum(base_eur), 2)  as base,
      round(sum(cuota_eur), 2) as cuota,
      round(sum(total_eur), 2) as total
    from filas
    group by tipo
  )
  select
    jsonb_build_object(
      'por_tipo', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tipo_iva', a.tipo_iva,
                 'operaciones', a.operaciones,
                 'base', a.base,
                 'cuota', a.cuota,
                 'total', a.total)
               order by a.tipo_iva desc nulls last)
        from agregado a where a.tipo = 'ingreso'
      ), '[]'::jsonb),
      'operaciones', coalesce((select operaciones from totales where tipo = 'ingreso'), 0),
      'base',        coalesce((select base from totales where tipo = 'ingreso'), 0),
      'cuota',       coalesce((select cuota from totales where tipo = 'ingreso'), 0),
      'total',       coalesce((select total from totales where tipo = 'ingreso'), 0)
    ),
    jsonb_build_object(
      'por_tipo', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tipo_iva', a.tipo_iva,
                 'operaciones', a.operaciones,
                 'base', a.base,
                 'cuota', a.cuota,
                 'total', a.total)
               order by a.tipo_iva desc nulls last)
        from agregado a where a.tipo = 'gasto'
      ), '[]'::jsonb),
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
    -- Positivo: a ingresar. Negativo: a compensar.
    'diferencia', round(v_repercutido - v_soportado, 2),

    -- CUADRE. Se calcula sumando los subtotales por tipo y comparándolos con
    -- el total general. Debe dar cero; si no, la interfaz lo enseña.
    'cuadre', jsonb_build_object(
      'ingresos', public.fn_cuadre_bloque(v_ingresos),
      'gastos',   public.fn_cuadre_bloque(v_gastos)
    )
  );
end;
$$;


comment on function public.fn_resumen_iva(date, date) is
  'Resumen de IVA por tipo impositivo para el modelo 303, con el cuadre entre '
  'la suma de los subtotales y el total general expuesto explícitamente.';

comment on function public.fn_cuadre_bloque(jsonb) is
  'Comprueba que los subtotales por tipo suman el total general. Pura.';


-- Libro de ingresos y gastos: una fila por movimiento, con todo lo que pide
-- una gestoría española.
drop view if exists public.vw_libro_gestoria;
create view public.vw_libro_gestoria
with (security_invoker = true) as
select
  m.id,
  m.fecha,
  m.tipo,
  m.concepto,
  c.nombre                              as categoria,
  m.divisa,
  m.base_imponible,
  m.iva_tipo,
  m.iva_importe,
  m.total,
  m.tasa_cambio,
  m.base_eur,
  -- Misma definición que en fn_resumen_iva: la cuota es la diferencia, para
  -- que cada fila del libro cuadre por sí sola.
  round(m.total_eur - m.base_eur, 2)    as cuota_eur,
  m.total_eur,
  p.nombre                              as anticipado_por,
  m.notas
from public.movimientos m
join public.categorias c on c.id = m.categoria_id
left join public.profiles p on p.id = m.anticipado_por;

comment on view public.vw_libro_gestoria is
  'Libro de ingresos y gastos. cuota_eur = total_eur − base_eur, para que cada '
  'fila cuadre exactamente.';


revoke all on public.vw_libro_gestoria from anon;
grant select on public.vw_libro_gestoria to authenticated;

revoke all on function public.fn_resumen_iva(date, date) from public, anon;
revoke all on function public.fn_cuadre_bloque(jsonb)    from public, anon;
grant execute on function public.fn_resumen_iva(date, date) to authenticated;
grant execute on function public.fn_cuadre_bloque(jsonb)    to authenticated;
