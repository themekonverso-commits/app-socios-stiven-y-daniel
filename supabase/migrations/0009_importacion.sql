-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Importación de CSV
--
-- Meter las ventas a mano funciona al principio; con volumen deja de
-- funcionar. Esto permite volcar un CSV de Shopify o de cualquier plataforma.
--
-- Dos garantías que sostienen todo lo demás:
--
--   1. Una importación entra ENTERA o no entra. Media importación es peor que
--      ninguna: dejaría movimientos sueltos imposibles de identificar.
--   2. Deshacer una importación borra exactamente lo que creó, y solo si nada
--      de eso ha quedado ya comprometido en un cierre aprobado o en un
--      reembolso. Borrar un movimiento que ya está dentro de un acta firmada
--      descuadraría la liquidación.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 Mapeos guardados: qué columna del CSV es cada campo del sistema.
create table if not exists public.mapeos_importacion (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  origen     text,
  config     jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz default now()
);

comment on table public.mapeos_importacion is
  'Correspondencia entre columnas del CSV y campos del sistema, guardada para '
  'no repetir el mapeo en cada importación.';

-- 1.2 Registro de cada importación, para poder deshacerla.
create table if not exists public.importaciones (
  id                uuid primary key default gen_random_uuid(),
  nombre_archivo    text not null,
  origen            text,
  filas_totales     int not null default 0,
  filas_importadas  int not null default 0,
  filas_omitidas    int not null default 0,
  importe_total_eur numeric(12, 2) not null default 0,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz default now()
);

comment on table public.importaciones is
  'Una fila por importación. Permite deshacerla borrando exactamente los '
  'movimientos que generó.';

create index if not exists importaciones_fecha_idx
  on public.importaciones (created_at desc);

-- 1.3 El vínculo entre un movimiento y la importación que lo creó.
--     on delete set null: si se borrara el registro de la importación, los
--     movimientos NO desaparecen; simplemente dejan de estar vinculados.
alter table public.movimientos
  add column if not exists importacion_id uuid
    references public.importaciones (id) on delete set null;

create index if not exists movimientos_importacion_idx
  on public.movimientos (importacion_id)
  where importacion_id is not null;

comment on column public.movimientos.importacion_id is
  'Importación que creó este movimiento. NULL si se registró a mano.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. SEGURIDAD
-- ───────────────────────────────────────────────────────────────────────────

alter table public.mapeos_importacion enable row level security;
alter table public.importaciones      enable row level security;

revoke all on public.mapeos_importacion from anon;
revoke all on public.importaciones      from anon;

drop policy if exists mapeos_select on public.mapeos_importacion;
create policy mapeos_select on public.mapeos_importacion
  for select to authenticated using (public.es_socio_activo());

drop policy if exists mapeos_insert on public.mapeos_importacion;
create policy mapeos_insert on public.mapeos_importacion
  for insert to authenticated with check (public.es_socio_activo());

drop policy if exists mapeos_update on public.mapeos_importacion;
create policy mapeos_update on public.mapeos_importacion
  for update to authenticated
  using (public.es_socio_activo()) with check (public.es_socio_activo());

drop policy if exists mapeos_delete on public.mapeos_importacion;
create policy mapeos_delete on public.mapeos_importacion
  for delete to authenticated using (public.es_socio_activo());

drop policy if exists importaciones_select on public.importaciones;
create policy importaciones_select on public.importaciones
  for select to authenticated using (public.es_socio_activo());

drop policy if exists importaciones_insert on public.importaciones;
create policy importaciones_insert on public.importaciones
  for insert to authenticated with check (public.es_socio_activo());

drop policy if exists importaciones_update on public.importaciones;
create policy importaciones_update on public.importaciones
  for update to authenticated
  using (public.es_socio_activo()) with check (public.es_socio_activo());

drop policy if exists importaciones_delete on public.importaciones;
create policy importaciones_delete on public.importaciones
  for delete to authenticated using (public.es_socio_activo());


-- ───────────────────────────────────────────────────────────────────────────
-- 3. ¿SE PUEDE DESHACER ESTA IMPORTACIÓN?
--
-- No se puede si alguno de sus movimientos:
--   · cae dentro del periodo de un cierre APROBADO, o
--   · está aplicado a un reembolso a un socio.
-- En ambos casos, borrarlo descuadraría números que ya se dieron por buenos.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_importacion_bloqueada(p_importacion uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_en_cierre    int := 0;
  v_en_reembolso int := 0;
  v_cierre       text;
begin
  select count(*), min(c.etiqueta)
    into v_en_cierre, v_cierre
  from public.movimientos m
  join public.cierres c
    on c.estado = 'aprobado'
   and m.fecha between c.periodo_inicio and c.periodo_fin
  where m.importacion_id = p_importacion;

  select count(*) into v_en_reembolso
  from public.movimientos m
  join public.reembolso_movimientos rm on rm.movimiento_id = m.id
  where m.importacion_id = p_importacion;

  return jsonb_build_object(
    'bloqueada', (v_en_cierre > 0 or v_en_reembolso > 0),
    'en_cierre', v_en_cierre,
    'en_reembolso', v_en_reembolso,
    'motivo', case
      when v_en_cierre > 0 then
        v_en_cierre || ' de sus movimientos entran en el cierre «'
        || coalesce(v_cierre, '?') || '», que ya está aprobado por ambos socios.'
      when v_en_reembolso > 0 then
        v_en_reembolso || ' de sus movimientos ya se han reembolsado a un socio.'
      else null
    end
  );
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. IMPORTAR — todo o nada
--
-- p_filas: [{fecha, concepto, categoria_id, tipo, divisa, importe,
--            tasa_cambio, num_pedidos}, ...]
--
-- Una sola función = una sola transacción. Si una fila revienta, no queda ni
-- el registro de la importación.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_importar_movimientos(
  p_nombre_archivo text,
  p_origen         text,
  p_filas          jsonb,
  p_filas_totales  int default 0,
  p_filas_omitidas int default 0
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

  if p_filas is null or jsonb_typeof(p_filas) <> 'array'
     or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay ninguna fila que importar.';
  end if;

  if jsonb_array_length(p_filas) > 5000 then
    raise exception 'Máximo 5.000 filas por importación.';
  end if;

  insert into public.importaciones (
    nombre_archivo, origen, filas_totales, filas_omitidas, created_by)
  values (p_nombre_archivo, p_origen, p_filas_totales, p_filas_omitidas, v_actor)
  returning id into v_importacion;

  for v_fila in select value from jsonb_array_elements(p_filas) loop
    v_importe := round(coalesce((v_fila ->> 'importe')::numeric, 0), 2);
    v_tasa    := coalesce((v_fila ->> 'tasa_cambio')::numeric, 1);

    if v_importe <= 0 then
      raise exception 'Una de las filas tiene importe cero o negativo: %', v_fila;
    end if;

    -- Sin desglose de IVA: un volcado de plataforma trae el importe cerrado.
    insert into public.movimientos (
      tipo, fecha, concepto, categoria_id, divisa,
      base_imponible, iva_tipo, iva_importe, total,
      tasa_cambio, total_eur, base_eur,
      num_pedidos, notas, created_by, importacion_id
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
      v_actor, v_importacion
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
-- 5. DESHACER
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_deshacer_importacion(p_importacion uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_estado  jsonb;
  v_borrados int;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;

  v_estado := public.fn_importacion_bloqueada(p_importacion);

  if (v_estado ->> 'bloqueada')::boolean then
    raise exception 'No se puede deshacer: %', v_estado ->> 'motivo';
  end if;

  delete from public.movimientos where importacion_id = p_importacion;
  get diagnostics v_borrados = row_count;

  delete from public.importaciones where id = p_importacion;

  return jsonb_build_object('borrados', v_borrados);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. PERMISOS
-- ───────────────────────────────────────────────────────────────────────────

revoke all on function public.fn_importacion_bloqueada(uuid) from public, anon;
revoke all on function public.fn_importar_movimientos(text, text, jsonb, int, int) from public, anon;
revoke all on function public.fn_deshacer_importacion(uuid) from public, anon;

grant execute on function public.fn_importacion_bloqueada(uuid) to authenticated;
grant execute on function public.fn_importar_movimientos(text, text, jsonb, int, int) to authenticated;
grant execute on function public.fn_deshacer_importacion(uuid) to authenticated;
