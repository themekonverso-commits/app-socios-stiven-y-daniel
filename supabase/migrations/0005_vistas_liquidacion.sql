-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Cálculo de la liquidación
--
-- Toda la aritmética del dinero vive aquí, en `numeric`. En JavaScript los
-- float no suman exacto y esto reparte dinero entre dos personas.
--
-- Las funciones se parten en dos capas a propósito:
--
--   fn_*_calculo(...)  → PURAS. No leen ninguna tabla: reciben los datos como
--                        jsonb y devuelven el resultado. Se pueden probar con
--                        casos inventados SIN escribir una sola fila en la
--                        base de datos, que es justo lo que hace falta cuando
--                        los datos reales son deudas entre socios.
--   fn_*(...)          → leen los datos de verdad y delegan en la pura.
--
-- Vistas con security_invoker y funciones INVOKER: la RLS sigue aplicando.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. VISTAS
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 Resumen por socio. Un anticipo (R2) es todo gasto con anticipado_por.
drop view if exists public.vw_anticipos_socio;
create view public.vw_anticipos_socio
with (security_invoker = true) as
with anticipado as (
  select
    m.anticipado_por                as socio_id,
    round(sum(m.total_eur), 2)      as anticipado,
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
  coalesce(r.reembolsado, 0)                    as reembolsado,
  round(coalesce(a.anticipado, 0) - coalesce(r.reembolsado, 0), 2) as pendiente,
  coalesce(a.num_anticipos, 0)::int             as num_anticipos
from public.profiles p
left join anticipado a on a.socio_id = p.id
left join reembolsado r on r.socio_id = p.id
where p.activo = true;

comment on view public.vw_anticipos_socio is
  'Por socio: cuánto ha puesto de su bolsillo, cuánto se le ha devuelto y '
  'cuánto se le debe (R2).';


-- 1.2 Detalle fila a fila de lo que queda por reembolsar.
--     Los anticipos cubiertos al 100 % quedan fuera.
drop view if exists public.vw_anticipos_pendientes;
create view public.vw_anticipos_pendientes
with (security_invoker = true) as
select
  m.id,
  m.fecha,
  m.concepto,
  c.nombre                                   as categoria,
  m.anticipado_por                           as socio_id,
  p.nombre                                   as socio,
  p.color                                    as socio_color,
  m.total_eur,
  round(coalesce(rm.cubierto, 0), 2)         as reembolsado_eur,
  round(m.total_eur - coalesce(rm.cubierto, 0), 2) as pendiente_eur
from public.movimientos m
join public.categorias c on c.id = m.categoria_id
join public.profiles p on p.id = m.anticipado_por
left join (
  select movimiento_id, sum(importe_eur) as cubierto
  from public.reembolso_movimientos
  group by movimiento_id
) rm on rm.movimiento_id = m.id
where m.tipo = 'gasto'
  and m.anticipado_por is not null
  and m.total_eur - coalesce(rm.cubierto, 0) > 0;

comment on view public.vw_anticipos_pendientes is
  'Anticipos con importe pendiente. Ordenar por fecha ascendente: lo más '
  'antiguo es lo que toca devolver antes.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. FUNCIONES PURAS — probables sin tocar ninguna tabla
-- ───────────────────────────────────────────────────────────────────────────

-- 2.1 R5 — ¿la fecha cae dentro de la Fase Inicial?
create or replace function public.fn_en_fase_inicial(
  p_fecha  date,
  p_inicio date,
  p_meses  int
)
returns boolean
language sql
immutable
as $$
  select p_fecha >= p_inicio
     and p_fecha < (p_inicio + make_interval(months => greatest(p_meses, 0)));
$$;

comment on function public.fn_en_fase_inicial(date, date, int) is
  'R5: durante los primeros meses se reinvierte el 100 %. Función pura.';


-- 2.2 R3 punto 2 — reparto a prorrata de un importe entre lo pendiente.
--
-- Entrada:  {"<socio_id>": <pendiente>, ...}  y el importe disponible.
-- Salida:   {"<socio_id>": <a_pagar>, ...}
--
-- Si el disponible cubre todo, cada uno recibe su pendiente íntegro. Si no,
-- proporcional, SIN preferencia de un socio sobre el otro.
--
-- El céntimo que sobra del redondeo se le da al socio con MAYOR pendiente, para
-- que la suma cuadre exacta con el disponible. Un céntimo descuadrado en una
-- herramienta de reparto entre socios destruye la confianza en todo lo demás.
create or replace function public.fn_prorrata_calculo(
  p_pendientes jsonb,
  p_disponible numeric
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_total      numeric := 0;
  v_disponible numeric := greatest(coalesce(p_disponible, 0), 0);
  v_resultado  jsonb   := '{}'::jsonb;
  v_asignado   numeric := 0;
  v_socio_max  text;
  v_max        numeric := -1;
  v_dif        numeric;
  v_clave      text;
  v_pend       numeric;
  v_cuota      numeric;
begin
  if p_pendientes is null or jsonb_typeof(p_pendientes) <> 'object' then
    return '{}'::jsonb;
  end if;

  for v_clave, v_pend in
    select key, greatest(coalesce(value::text::numeric, 0), 0)
    from jsonb_each(p_pendientes)
  loop
    v_total := v_total + v_pend;
    if v_pend > v_max then
      v_max := v_pend;
      v_socio_max := v_clave;
    end if;
  end loop;

  -- Nada pendiente o nada disponible: todos a cero.
  if v_total <= 0 or v_disponible <= 0 then
    for v_clave in select key from jsonb_each(p_pendientes) loop
      v_resultado := v_resultado || jsonb_build_object(v_clave, 0);
    end loop;
    return v_resultado;
  end if;

  -- Alcanza para todos: cada uno cobra lo suyo, y no más.
  if v_disponible >= v_total then
    for v_clave, v_pend in
      select key, greatest(coalesce(value::text::numeric, 0), 0)
      from jsonb_each(p_pendientes)
    loop
      v_resultado := v_resultado || jsonb_build_object(v_clave, round(v_pend, 2));
    end loop;
    return v_resultado;
  end if;

  -- No alcanza: proporcional a lo pendiente de cada uno.
  for v_clave, v_pend in
    select key, greatest(coalesce(value::text::numeric, 0), 0)
    from jsonb_each(p_pendientes)
  loop
    v_cuota := round(v_pend * v_disponible / v_total, 2);
    v_asignado := v_asignado + v_cuota;
    v_resultado := v_resultado || jsonb_build_object(v_clave, v_cuota);
  end loop;

  -- El céntimo de diferencia, al de mayor pendiente.
  v_dif := round(v_disponible - v_asignado, 2);
  if v_dif <> 0 and v_socio_max is not null then
    v_resultado := v_resultado || jsonb_build_object(
      v_socio_max,
      round((v_resultado ->> v_socio_max)::numeric + v_dif, 2)
    );
  end if;

  return v_resultado;
end;
$$;

comment on function public.fn_prorrata_calculo(jsonb, numeric) is
  'R3.2: prorrata sin preferencia entre socios. Pura: no lee tablas.';


-- 2.3 R7 — liquidación final.
--
-- Entrada: {"<socio_id>": {"anticipado": x, "reembolsado": y}, ...}
-- Se suma lo anticipado por cada uno, se resta lo devuelto, y el neto se
-- reparte por mitades: quien haya puesto por encima de su mitad tiene un
-- crédito contra el otro por el exceso.
create or replace function public.fn_liquidacion_calculo(p_socios jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_por_socio  jsonb := '{}'::jsonb;
  v_total      numeric := 0;
  v_mitad      numeric;
  v_clave      text;
  v_valor      jsonb;
  v_ant        numeric;
  v_reem       numeric;
  v_neto       numeric;
  v_mayor_id   text;
  v_mayor      numeric := null;
  v_menor_id   text;
  v_menor      numeric := null;
  v_importe    numeric := 0;
begin
  if p_socios is null or jsonb_typeof(p_socios) <> 'object' then
    return jsonb_build_object(
      'por_socio', '{}'::jsonb, 'total_neto', 0, 'mitad_correspondiente', 0,
      'deudor_id', null, 'acreedor_id', null, 'importe_a_compensar', 0
    );
  end if;

  for v_clave, v_valor in select key, value from jsonb_each(p_socios) loop
    v_ant  := round(coalesce((v_valor ->> 'anticipado')::numeric, 0), 2);
    v_reem := round(coalesce((v_valor ->> 'reembolsado')::numeric, 0), 2);
    v_neto := round(v_ant - v_reem, 2);
    v_total := v_total + v_neto;

    v_por_socio := v_por_socio || jsonb_build_object(
      v_clave,
      jsonb_build_object('anticipado', v_ant, 'reembolsado', v_reem, 'neto', v_neto)
    );

    if v_mayor is null or v_neto > v_mayor then
      v_mayor := v_neto; v_mayor_id := v_clave;
    end if;
    if v_menor is null or v_neto < v_menor then
      v_menor := v_neto; v_menor_id := v_clave;
    end if;
  end loop;

  v_mitad := round(v_total / 2.0, 2);

  -- Igualados: nadie debe nada a nadie.
  if v_mayor is null or v_menor is null or v_mayor = v_menor then
    return jsonb_build_object(
      'por_socio', v_por_socio,
      'total_neto', round(v_total, 2),
      'mitad_correspondiente', v_mitad,
      'deudor_id', null,
      'acreedor_id', null,
      'importe_a_compensar', 0
    );
  end if;

  -- Quien puso de más cobra la diferencia partida por dos.
  v_importe := round((v_mayor - v_menor) / 2.0, 2);

  return jsonb_build_object(
    'por_socio', v_por_socio,
    'total_neto', round(v_total, 2),
    'mitad_correspondiente', v_mitad,
    'deudor_id', v_menor_id,
    'acreedor_id', v_mayor_id,
    'importe_a_compensar', v_importe
  );
end;
$$;

comment on function public.fn_liquidacion_calculo(jsonb) is
  'R7: liquidación final por mitades del neto anticipado. Pura: no lee tablas.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. FUNCIONES CON DATOS — leen y delegan en las puras
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_prorrata_reembolso(p_disponible numeric)
returns jsonb
language sql
stable
set search_path = public
as $$
  select public.fn_prorrata_calculo(
    coalesce(
      (select jsonb_object_agg(v.socio_id::text, v.pendiente)
         from public.vw_anticipos_socio v
        where v.pendiente > 0),
      '{}'::jsonb
    ),
    p_disponible
  );
$$;

comment on function public.fn_prorrata_reembolso(numeric) is
  'R3.2 sobre los datos reales. La aritmética la hace fn_prorrata_calculo.';


create or replace function public.fn_liquidacion_final()
returns jsonb
language sql
stable
set search_path = public
as $$
  select public.fn_liquidacion_calculo(
    coalesce(
      (select jsonb_object_agg(
                v.socio_id::text,
                jsonb_build_object('anticipado', v.anticipado,
                                   'reembolsado', v.reembolsado))
         from public.vw_anticipos_socio v),
      '{}'::jsonb
    )
  );
$$;

comment on function public.fn_liquidacion_final() is
  'R7 sobre los datos reales.';


-- 3.3 Foto completa de la liquidación a una fecha.
--
-- Sobre las pérdidas acumuladas: un cierre APROBADO fija el arrastre del
-- siguiente periodo, así que no se recalcula desde el origen. El periodo
-- «abierto» va desde el día siguiente al último cierre aprobado hasta la fecha
-- de corte.
--
--   perdidas_acumuladas = arrastre del último cierre + la pérdida del periodo
--                         abierto, si la hay
--   base_distribuible   = resultado del periodo abierto − perdidas_acumuladas,
--                         nunca por debajo de cero
--
-- Con esa definición, o hay pérdidas que compensar o hay base que repartir,
-- nunca las dos cosas a la vez.
create or replace function public.fn_estado_liquidacion(p_fecha_corte date)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_inicio_abierto date;
  v_arrastre       numeric := 0;
  v_ingresos       numeric := 0;
  v_gastos         numeric := 0;
  v_resultado      numeric := 0;
  v_perdidas       numeric := 0;
  v_base           numeric := 0;
  v_anticipos      jsonb   := '{}'::jsonb;
  v_pendiente      numeric := 0;
  v_caja           numeric := 0;
  v_saldo_ini      numeric := 0;
  v_fecha_ini      date;
  v_fase_inicio    date;
  v_fase_meses     int;
  v_en_fase        boolean := false;
  v_puede          boolean;
  v_motivo         text := null;
  v_motivos        jsonb := '[]'::jsonb;
  v_deudor         text;
begin
  -- Último cierre aprobado anterior a la fecha de corte.
  select (c.periodo_fin + 1),
         greatest(c.perdidas_previas_eur - c.resultado_eur, 0)
    into v_inicio_abierto, v_arrastre
  from public.cierres c
  where c.estado = 'aprobado' and c.periodo_fin < p_fecha_corte
  order by c.periodo_fin desc
  limit 1;

  v_arrastre := coalesce(v_arrastre, 0);

  -- Resultado del periodo abierto.
  select
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0), 2),
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0), 2)
    into v_ingresos, v_gastos
  from public.movimientos m
  where m.fecha <= p_fecha_corte
    and (v_inicio_abierto is null or m.fecha >= v_inicio_abierto);

  v_resultado := round(v_ingresos - v_gastos, 2);
  v_perdidas  := round(v_arrastre + greatest(-v_resultado, 0), 2);
  v_base      := round(greatest(v_resultado - v_perdidas, 0), 2);

  -- Anticipos por socio (R2).
  select
    coalesce(jsonb_object_agg(
      v.socio_id::text,
      jsonb_build_object('anticipado', v.anticipado,
                         'reembolsado', v.reembolsado,
                         'pendiente', v.pendiente,
                         'nombre', v.nombre)
    ), '{}'::jsonb),
    coalesce(sum(greatest(v.pendiente, 0)), 0)
    into v_anticipos, v_pendiente
  from public.vw_anticipos_socio v;

  v_pendiente := round(coalesce(v_pendiente, 0), 2);

  -- Caja disponible a la fecha de corte.
  select coalesce((valor ->> 'importe')::numeric, 0),
         coalesce((valor ->> 'fecha')::date, p_fecha_corte)
    into v_saldo_ini, v_fecha_ini
  from public.ajustes where clave = 'saldo_inicial';

  v_saldo_ini := coalesce(v_saldo_ini, 0);
  v_fecha_ini := coalesce(v_fecha_ini, p_fecha_corte);

  select round(v_saldo_ini
    + coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0)
    - coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0), 2)
    into v_caja
  from public.movimientos m
  where m.fecha >= v_fecha_ini and m.fecha <= p_fecha_corte;

  v_caja := coalesce(v_caja, round(v_saldo_ini, 2));

  -- R5 — Fase Inicial.
  select coalesce((valor ->> 'inicio')::date, '2026-09-07'::date),
         coalesce((valor ->> 'meses')::int, 3)
    into v_fase_inicio, v_fase_meses
  from public.ajustes where clave = 'fase_inicial';

  if v_fase_inicio is not null then
    v_en_fase := public.fn_en_fase_inicial(p_fecha_corte, v_fase_inicio, v_fase_meses);
  end if;

  -- R4 y R5 — motivos que impiden repartir, en orden de contundencia.
  if v_en_fase then
    v_motivos := v_motivos || to_jsonb(
      'Fase Inicial: durante los primeros ' || v_fase_meses ||
      ' meses se reinvierte el 100 %, sin reparto de beneficios.');
  end if;

  if v_pendiente > 0 then
    select string_agg(v.nombre, ' y ') into v_deudor
    from public.vw_anticipos_socio v where v.pendiente > 0;

    v_motivos := v_motivos || to_jsonb(
      'Quedan ' || trim(to_char(v_pendiente, 'FM999G999G990D00')) ||
      ' € de anticipos por reembolsar a ' || coalesce(v_deudor, 'los socios') || '.');
  end if;

  if v_perdidas > 0 then
    v_motivos := v_motivos || to_jsonb(
      'Hay ' || trim(to_char(v_perdidas, 'FM999G999G990D00')) ||
      ' € de pérdidas acumuladas sin compensar.');
  end if;

  v_puede := not v_en_fase and v_pendiente <= 0 and v_perdidas <= 0 and v_base > 0;

  if not v_puede then
    if jsonb_array_length(v_motivos) > 0 then
      v_motivo := v_motivos ->> 0;
    else
      v_motivo := 'No hay resultado positivo que repartir en este periodo.';
      v_motivos := v_motivos || to_jsonb(v_motivo);
    end if;
  end if;

  return jsonb_build_object(
    'fecha_corte',                p_fecha_corte,
    'periodo_abierto_desde',      v_inicio_abierto,
    'ingresos_acumulados',        v_ingresos,
    'gastos_acumulados',          v_gastos,
    'resultado_acumulado',        v_resultado,
    'arrastre_previo',            round(v_arrastre, 2),
    'perdidas_acumuladas',        v_perdidas,
    'anticipos',                  v_anticipos,
    'total_pendiente_reembolso',  v_pendiente,
    'caja_disponible',            v_caja,
    'base_distribuible',          v_base,
    'en_fase_inicial',            v_en_fase,
    'puede_repartir',             v_puede,
    'motivo_bloqueo',             v_motivo,
    'motivos_bloqueo',            v_motivos
  );
end;
$$;

comment on function public.fn_estado_liquidacion(date) is
  'Foto de la liquidación a una fecha: resultado, pérdidas, anticipos, caja y '
  'si se puede repartir (R3, R4, R5).';


-- ───────────────────────────────────────────────────────────────────────────
-- 4. PERMISOS
-- ───────────────────────────────────────────────────────────────────────────

revoke all on public.vw_anticipos_socio      from anon;
revoke all on public.vw_anticipos_pendientes from anon;

grant select on public.vw_anticipos_socio      to authenticated;
grant select on public.vw_anticipos_pendientes to authenticated;

revoke all on function public.fn_en_fase_inicial(date, date, int)   from public, anon;
revoke all on function public.fn_prorrata_calculo(jsonb, numeric)   from public, anon;
revoke all on function public.fn_liquidacion_calculo(jsonb)         from public, anon;
revoke all on function public.fn_prorrata_reembolso(numeric)        from public, anon;
revoke all on function public.fn_liquidacion_final()                from public, anon;
revoke all on function public.fn_estado_liquidacion(date)           from public, anon;

grant execute on function public.fn_en_fase_inicial(date, date, int) to authenticated;
grant execute on function public.fn_prorrata_calculo(jsonb, numeric) to authenticated;
grant execute on function public.fn_liquidacion_calculo(jsonb)       to authenticated;
grant execute on function public.fn_prorrata_reembolso(numeric)      to authenticated;
grant execute on function public.fn_liquidacion_final()              to authenticated;
grant execute on function public.fn_estado_liquidacion(date)         to authenticated;
