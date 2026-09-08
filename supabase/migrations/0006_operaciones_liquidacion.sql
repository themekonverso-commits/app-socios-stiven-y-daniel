-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — Operaciones de la liquidación
--
-- Por qué son funciones SQL y no código en la aplicación:
--
--   1. TRANSACCIONALIDAD. El cliente de Supabase no sabe abrir transacciones.
--      Registrar un reembolso son varias escrituras (cabecera + líneas + los
--      flags que actualiza el trigger): si se hicieran en llamadas sueltas, un
--      fallo a mitad dejaría el estado inconsistente. Una función es una sola
--      sentencia y, por tanto, una sola transacción.
--
--   2. AUTORIDAD. La aprobación de un cierre usa auth.uid() DENTRO de la base
--      de datos. Un socio no puede firmar por el otro ni manipulando la
--      petición: no hay ningún parámetro que diga quién firma.
--
--   3. EL DINERO SE CALCULA EN numeric. Ningún importe pasa por un float de
--      JavaScript.
--
-- Todas SECURITY INVOKER: la RLS sigue aplicando.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. REEMBOLSOS
-- ───────────────────────────────────────────────────────────────────────────

-- Registra un reembolso con su desglose en una sola transacción.
-- p_lineas: [{"movimiento_id": "...", "importe_eur": 123.45}, ...]
create or replace function public.fn_registrar_reembolso(
  p_socio_id uuid,
  p_fecha    date,
  p_importe  numeric,
  p_metodo   text,
  p_notas    text,
  p_lineas   jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_reembolso uuid;
  v_linea     jsonb;
  v_suma      numeric := 0;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array'
     or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Un reembolso necesita al menos un anticipo al que aplicarse.';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_suma := v_suma + coalesce((v_linea ->> 'importe_eur')::numeric, 0);
  end loop;

  v_suma := round(v_suma, 2);

  if round(p_importe, 2) < v_suma then
    raise exception
      'El importe del reembolso (% €) no cubre el desglose (% €).',
      round(p_importe, 2), v_suma;
  end if;

  insert into public.reembolsos (fecha, socio_id, importe_eur, metodo, notas, created_by)
  values (p_fecha, p_socio_id, round(p_importe, 2), p_metodo, p_notas, v_actor)
  returning id into v_reembolso;

  -- El trigger validar_reembolso comprueba, línea a línea, que el anticipo es
  -- de ese socio y que no se le paga más de lo que se le debe.
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    insert into public.reembolso_movimientos (reembolso_id, movimiento_id, importe_eur)
    values (
      v_reembolso,
      (v_linea ->> 'movimiento_id')::uuid,
      round((v_linea ->> 'importe_eur')::numeric, 2)
    );
  end loop;

  return v_reembolso;
end;
$$;

comment on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb) is
  'Alta de un reembolso y su desglose en una sola transacción.';


-- Anular un reembolso: al borrarlo, las líneas caen en cascada y el trigger
-- devuelve los anticipos a «pendiente».
create or replace function public.fn_anular_reembolso(p_reembolso uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;

  delete from public.reembolsos where id = p_reembolso;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. CIERRE TRIMESTRAL
-- ───────────────────────────────────────────────────────────────────────────

-- Cifras de un cierre SIN guardarlo. La misma función alimenta el paso 2 del
-- asistente, la vista previa del paso 3 y el alta: así lo que se ve es
-- exactamente lo que se guarda.
create or replace function public.fn_previsualizar_cierre(
  p_inicio          date,
  p_fin             date,
  p_pct_reinversion numeric default 50
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_ingresos    numeric := 0;
  v_gastos      numeric := 0;
  v_resultado   numeric := 0;
  v_previas     numeric := 0;
  v_pendientes  numeric := 0;
  v_base        numeric := 0;
  v_pct_re      numeric;
  v_reinversion numeric := 0;
  v_reparto     numeric := 0;
  v_por_socio   jsonb   := '{}'::jsonb;
  v_fase_inicio date;
  v_fase_meses  int;
  v_en_fase     boolean := false;
  v_puede       boolean;
  v_motivo      text := null;
  v_socios      uuid[];
  v_mitad       numeric;
begin
  select
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'ingreso'), 0), 2),
    round(coalesce(sum(m.total_eur) filter (where m.tipo = 'gasto'), 0), 2)
    into v_ingresos, v_gastos
  from public.movimientos m
  where m.fecha between p_inicio and p_fin;

  v_resultado := round(v_ingresos - v_gastos, 2);

  -- Arrastre de pérdidas fijado por el último cierre aprobado anterior.
  select greatest(c.perdidas_previas_eur - c.resultado_eur, 0)
    into v_previas
  from public.cierres c
  where c.estado = 'aprobado' and c.periodo_fin < p_inicio
  order by c.periodo_fin desc
  limit 1;

  v_previas := round(coalesce(v_previas, 0), 2);

  select round(coalesce(sum(greatest(v.pendiente, 0)), 0), 2)
    into v_pendientes
  from public.vw_anticipos_socio v;

  v_base := round(greatest(v_resultado - v_previas, 0), 2);

  -- R5 — dentro de la Fase Inicial se reinvierte el 100 %, sin excepción.
  select coalesce((valor ->> 'inicio')::date, '2026-09-07'::date),
         coalesce((valor ->> 'meses')::int, 3)
    into v_fase_inicio, v_fase_meses
  from public.ajustes where clave = 'fase_inicial';

  if v_fase_inicio is not null then
    v_en_fase := public.fn_en_fase_inicial(p_fin, v_fase_inicio, v_fase_meses);
  end if;

  -- R4 — nadie cobra beneficio con anticipos pendientes o pérdidas sin cubrir.
  v_puede := not v_en_fase and v_pendientes <= 0 and v_previas <= 0 and v_base > 0;

  if v_en_fase then
    v_motivo := 'Fase Inicial: el contrato fija reinversión del 100 % durante '
                || v_fase_meses || ' meses.';
  elsif v_pendientes > 0 then
    v_motivo := 'Hay ' || trim(to_char(v_pendientes, 'FM999G999G990D00'))
                || ' € de anticipos pendientes de reembolso.';
  elsif v_previas > 0 then
    v_motivo := 'Quedan ' || trim(to_char(v_previas, 'FM999G999G990D00'))
                || ' € de pérdidas de periodos anteriores por compensar.';
  elsif v_base <= 0 then
    v_motivo := 'El periodo no deja base distribuible.';
  end if;

  -- Si no se puede repartir, todo va a reinversión. No es una decisión de la
  -- interfaz: lo impone el contrato.
  v_pct_re := case
                when not v_puede then 100
                else least(greatest(coalesce(p_pct_reinversion, 50), 0), 100)
              end;

  v_reinversion := round(v_base * v_pct_re / 100, 2);
  -- El reparto es el resto, no otro redondeo: así los dos importes suman la
  -- base exacta y no se pierde ni se inventa un céntimo.
  v_reparto := round(v_base - v_reinversion, 2);

  -- R1 — el remanente se parte por mitades entre los dos socios.
  select array_agg(p.id order by p.nombre) into v_socios
  from public.profiles p where p.activo = true;

  if v_reparto > 0 and v_socios is not null and array_length(v_socios, 1) = 2 then
    v_mitad := round(v_reparto / 2.0, 2);
    v_por_socio := jsonb_build_object(
      v_socios[1]::text, v_mitad,
      -- Al segundo, el resto: absorbe el céntimo impar.
      v_socios[2]::text, round(v_reparto - v_mitad, 2)
    );
  end if;

  return jsonb_build_object(
    'periodo_inicio',           p_inicio,
    'periodo_fin',              p_fin,
    'ingresos_eur',             v_ingresos,
    'gastos_eur',               v_gastos,
    'resultado_eur',            v_resultado,
    'perdidas_previas_eur',     v_previas,
    'anticipos_pendientes_eur', v_pendientes,
    'base_distribuible_eur',    v_base,
    'pct_reinversion',          v_pct_re,
    'pct_reparto',              round(100 - v_pct_re, 2),
    'importe_reinversion',      v_reinversion,
    'importe_reparto_total',    v_reparto,
    'reparto_por_socio',        v_por_socio,
    'en_fase_inicial',          v_en_fase,
    'puede_repartir',           v_puede,
    'motivo_bloqueo',           v_motivo
  );
end;
$$;

comment on function public.fn_previsualizar_cierre(date, date, numeric) is
  'Cifras de un cierre sin guardarlo. Lo que se ve en el asistente es lo que se guarda.';


create or replace function public.fn_crear_cierre(
  p_etiqueta        text,
  p_inicio          date,
  p_fin             date,
  p_pct_reinversion numeric default 50,
  p_notas           text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_datos  jsonb;
  v_cierre uuid;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  if p_fin < p_inicio then
    raise exception 'El periodo termina antes de empezar.';
  end if;

  -- Las cifras las recalcula el servidor: no se aceptan las del formulario.
  v_datos := public.fn_previsualizar_cierre(p_inicio, p_fin, p_pct_reinversion);

  insert into public.cierres (
    etiqueta, periodo_inicio, periodo_fin,
    ingresos_eur, gastos_eur, resultado_eur,
    perdidas_previas_eur, anticipos_pendientes_eur, base_distribuible_eur,
    pct_reinversion, pct_reparto,
    importe_reinversion, importe_reparto_total, reparto_por_socio,
    estado, notas, created_by
  )
  values (
    p_etiqueta, p_inicio, p_fin,
    (v_datos ->> 'ingresos_eur')::numeric,
    (v_datos ->> 'gastos_eur')::numeric,
    (v_datos ->> 'resultado_eur')::numeric,
    (v_datos ->> 'perdidas_previas_eur')::numeric,
    (v_datos ->> 'anticipos_pendientes_eur')::numeric,
    (v_datos ->> 'base_distribuible_eur')::numeric,
    (v_datos ->> 'pct_reinversion')::numeric,
    (v_datos ->> 'pct_reparto')::numeric,
    (v_datos ->> 'importe_reinversion')::numeric,
    (v_datos ->> 'importe_reparto_total')::numeric,
    coalesce(v_datos -> 'reparto_por_socio', '{}'::jsonb),
    'borrador', p_notas, v_actor
  )
  returning id into v_cierre;

  return v_cierre;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. APROBACIÓN — cada socio firma la suya, y solo la suya
-- ───────────────────────────────────────────────────────────────────────────

-- No hay parámetro para decir quién firma: se toma de auth.uid(). Por eso un
-- socio no puede marcar la casilla del otro ni manipulando la petición.
create or replace function public.fn_aprobar_cierre(p_cierre uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_estado      text;
  v_aprob       jsonb;
  v_num_socios  int;
  v_num_firmas  int;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  if not public.es_socio_activo() then
    raise exception 'Solo un socio activo puede aprobar un cierre.';
  end if;

  select estado, aprobaciones into v_estado, v_aprob
  from public.cierres where id = p_cierre for update;

  if v_estado is null then
    raise exception 'Ese cierre no existe.';
  end if;

  if v_estado <> 'borrador' then
    raise exception 'El cierre ya está %; no admite más firmas.', v_estado;
  end if;

  v_aprob := coalesce(v_aprob, '{}'::jsonb)
             || jsonb_build_object(v_actor::text, now());

  select count(*) into v_num_socios from public.profiles where activo = true;
  select count(*) into v_num_firmas
  from jsonb_object_keys(v_aprob) k
  where k::uuid in (select id from public.profiles where activo = true);

  -- Con la firma de todos los socios activos el acta queda cerrada. A partir
  -- de ese momento el trigger proteger_cierre impide tocarla.
  if v_num_firmas >= v_num_socios then
    update public.cierres
       set aprobaciones = v_aprob, estado = 'aprobado'
     where id = p_cierre;
  else
    update public.cierres set aprobaciones = v_aprob where id = p_cierre;
  end if;

  return jsonb_build_object(
    'aprobaciones', v_aprob,
    'firmas', v_num_firmas,
    'socios', v_num_socios,
    'estado', case when v_num_firmas >= v_num_socios then 'aprobado' else 'borrador' end
  );
end;
$$;

comment on function public.fn_aprobar_cierre(uuid) is
  'Firma del socio autenticado. Quién firma sale de auth.uid(), nunca de un parámetro.';


-- Retirar la propia firma mientras el cierre siga en borrador.
create or replace function public.fn_retirar_aprobacion(p_cierre uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_estado text;
  v_aprob  jsonb;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  select estado, aprobaciones into v_estado, v_aprob
  from public.cierres where id = p_cierre for update;

  if v_estado is null then
    raise exception 'Ese cierre no existe.';
  end if;

  if v_estado <> 'borrador' then
    raise exception 'El cierre está % y ya no se puede modificar.', v_estado;
  end if;

  v_aprob := coalesce(v_aprob, '{}'::jsonb) - v_actor::text;
  update public.cierres set aprobaciones = v_aprob where id = p_cierre;

  return jsonb_build_object('aprobaciones', v_aprob);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. PERMISOS
-- ───────────────────────────────────────────────────────────────────────────

revoke all on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb) from public, anon;
revoke all on function public.fn_anular_reembolso(uuid)                     from public, anon;
revoke all on function public.fn_previsualizar_cierre(date, date, numeric)  from public, anon;
revoke all on function public.fn_crear_cierre(text, date, date, numeric, text) from public, anon;
revoke all on function public.fn_aprobar_cierre(uuid)                       from public, anon;
revoke all on function public.fn_retirar_aprobacion(uuid)                   from public, anon;

grant execute on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb) to authenticated;
grant execute on function public.fn_anular_reembolso(uuid)                     to authenticated;
grant execute on function public.fn_previsualizar_cierre(date, date, numeric)  to authenticated;
grant execute on function public.fn_crear_cierre(text, date, date, numeric, text) to authenticated;
grant execute on function public.fn_aprobar_cierre(uuid)                       to authenticated;
grant execute on function public.fn_retirar_aprobacion(uuid)                   to authenticated;
