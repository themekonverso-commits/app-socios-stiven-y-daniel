-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 — Liquidación entre socios
--
-- Implementa las reglas del contrato firmado. No se simplifican ni se
-- interpretan: cada una está citada donde se aplica.
--
--   R1  Participación 50/50 en beneficios y en pérdidas.
--   R2  Quien adelanta un gasto genera un derecho de crédito frente al
--       negocio. El gasto es del negocio; el socio solo lo financia.
--   R3  Orden de prelación de los ingresos: gastos corrientes → reembolso de
--       anticipos (a prorrata si no alcanza) → pérdidas acumuladas →
--       reinversión → reparto 50/50.
--   R4  Nadie cobra beneficio mientras haya anticipos pendientes del otro
--       socio o pérdidas sin compensar.
--   R5  Fase Inicial: 3 meses desde el 07/09/2026 con reinversión del 100 %.
--   R6  Límite de aportación acordado (3.000 €) con reunión de continuidad.
--   R7  Liquidación final por mitades del neto anticipado.
--
-- La integridad NO se deja en manos del formulario. Un reembolso que supere lo
-- pendiente, o la edición de un cierre ya aprobado, los bloquea la base de
-- datos con triggers: las políticas de RLS no protegen de quien tenga la
-- service role key, y aquí se está repartiendo dinero entre dos personas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 Cabecera de un reembolso a un socio
create table if not exists public.reembolsos (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  socio_id    uuid not null references public.profiles (id),
  importe_eur numeric(12, 2) not null check (importe_eur > 0),
  metodo      text,
  notas       text,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz default now()
);

comment on table public.reembolsos is
  'Devolución a un socio de anticipos que puso de su bolsillo (R2).';
comment on column public.reembolsos.metodo is
  'transferencia, efectivo o compensación.';

create index if not exists reembolsos_socio_idx on public.reembolsos (socio_id);
create index if not exists reembolsos_fecha_idx on public.reembolsos (fecha desc);


-- 1.2 Qué anticipos concretos cubre ese reembolso, y por cuánto.
--     Permite reembolsos PARCIALES: 300 € sobre un anticipo de 500 € dejan
--     200 € pendientes, no lo dan por saldado.
create table if not exists public.reembolso_movimientos (
  reembolso_id  uuid not null references public.reembolsos (id) on delete cascade,
  movimiento_id uuid not null references public.movimientos (id) on delete restrict,
  importe_eur   numeric(12, 2) not null check (importe_eur > 0),
  primary key (reembolso_id, movimiento_id)
);

comment on table public.reembolso_movimientos is
  'Reparto de un reembolso entre los anticipos que cubre. Un anticipo puede '
  'recibir varios reembolsos parciales hasta quedar saldado.';

create index if not exists reembolso_mov_movimiento_idx
  on public.reembolso_movimientos (movimiento_id);


-- 1.3 Cierre trimestral
create table if not exists public.cierres (
  id                       uuid primary key default gen_random_uuid(),
  etiqueta                 text not null,
  periodo_inicio           date not null,
  periodo_fin              date not null,
  ingresos_eur             numeric(12, 2) not null,
  gastos_eur               numeric(12, 2) not null,
  resultado_eur            numeric(12, 2) not null,
  perdidas_previas_eur     numeric(12, 2) not null default 0,
  anticipos_pendientes_eur numeric(12, 2) not null default 0,
  base_distribuible_eur    numeric(12, 2) not null,
  pct_reinversion          numeric(5, 2) not null default 50,
  pct_reparto              numeric(5, 2) not null default 50,
  importe_reinversion      numeric(12, 2) not null default 0,
  importe_reparto_total    numeric(12, 2) not null default 0,
  reparto_por_socio        jsonb not null default '{}'::jsonb,
  estado                   text not null default 'borrador'
                             check (estado in ('borrador', 'aprobado', 'anulado')),
  aprobaciones             jsonb not null default '{}'::jsonb,
  notas                    text,
  created_by               uuid not null references public.profiles (id),
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  unique (periodo_inicio, periodo_fin)
);

comment on table public.cierres is
  'Acta de la reunión trimestral. Un cierre aprobado es INMUTABLE: lo garantiza '
  'un trigger, no solo la política de RLS.';
comment on column public.cierres.aprobaciones is
  '{ "<socio_id>": "<timestamp ISO>" }. Con las dos firmas el estado pasa a aprobado.';
comment on column public.cierres.perdidas_previas_eur is
  'Pérdidas arrastradas al inicio del periodo. Un cierre aprobado fija el '
  'arrastre del siguiente, que ya no recalcula desde el origen.';

create index if not exists cierres_periodo_idx on public.cierres (periodo_fin desc);

drop trigger if exists set_updated_at on public.cierres;
create trigger set_updated_at
  before update on public.cierres
  for each row execute function public.set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- 2. INTEGRIDAD — lo que no puede depender del formulario
-- ───────────────────────────────────────────────────────────────────────────

-- 2.1 Un reembolso nunca puede superar lo que queda pendiente del anticipo,
--     y solo puede aplicarse a un anticipo del MISMO socio al que se paga.
create or replace function public.validar_reembolso_movimiento()
returns trigger
language plpgsql
as $$
declare
  v_total       numeric(12, 2);
  v_tipo        text;
  v_anticipante uuid;
  v_socio_pago  uuid;
  v_ya          numeric(12, 2);
  v_pendiente   numeric(12, 2);
begin
  select m.total_eur, m.tipo, m.anticipado_por
    into v_total, v_tipo, v_anticipante
  from public.movimientos m
  where m.id = new.movimiento_id;

  if v_total is null then
    raise exception 'El movimiento % no existe.', new.movimiento_id;
  end if;

  if v_tipo <> 'gasto' or v_anticipante is null then
    raise exception
      'Solo se pueden reembolsar gastos anticipados por un socio (movimiento %).',
      new.movimiento_id;
  end if;

  select r.socio_id into v_socio_pago
  from public.reembolsos r
  where r.id = new.reembolso_id;

  if v_socio_pago is distinct from v_anticipante then
    raise exception
      'El anticipo lo puso otro socio: no se le puede reembolsar a %.',
      v_socio_pago;
  end if;

  -- Lo ya aplicado a este anticipo, sin contar la fila que se está tocando.
  select coalesce(sum(rm.importe_eur), 0) into v_ya
  from public.reembolso_movimientos rm
  where rm.movimiento_id = new.movimiento_id
    and not (rm.reembolso_id = new.reembolso_id
             and rm.movimiento_id = new.movimiento_id);

  v_pendiente := v_total - v_ya;

  if new.importe_eur > v_pendiente then
    raise exception
      'El reembolso (% €) supera lo pendiente de ese anticipo (% €).',
      new.importe_eur, v_pendiente;
  end if;

  return new;
end;
$$;

drop trigger if exists validar_reembolso on public.reembolso_movimientos;
create trigger validar_reembolso
  before insert or update on public.reembolso_movimientos
  for each row execute function public.validar_reembolso_movimiento();


-- 2.2 El flag `reembolsado` del movimiento lo lleva la base de datos, no la
--     aplicación: así no puede quedar desincronizado con los importes reales.
create or replace function public.sincronizar_flag_reembolsado()
returns trigger
language plpgsql
as $$
declare
  v_movimiento uuid := coalesce(new.movimiento_id, old.movimiento_id);
  v_total      numeric(12, 2);
  v_cubierto   numeric(12, 2);
begin
  select m.total_eur into v_total
  from public.movimientos m where m.id = v_movimiento;

  select coalesce(sum(rm.importe_eur), 0) into v_cubierto
  from public.reembolso_movimientos rm where rm.movimiento_id = v_movimiento;

  update public.movimientos
     set reembolsado = (v_cubierto >= v_total),
         fecha_reembolso = case
           when v_cubierto >= v_total then (
             select max(r.fecha)
             from public.reembolsos r
             join public.reembolso_movimientos rm on rm.reembolso_id = r.id
             where rm.movimiento_id = v_movimiento
           )
           else null
         end
   where id = v_movimiento;

  return null;
end;
$$;

drop trigger if exists sincronizar_reembolsado on public.reembolso_movimientos;
create trigger sincronizar_reembolsado
  after insert or update or delete on public.reembolso_movimientos
  for each row execute function public.sincronizar_flag_reembolsado();


-- 2.3 El detalle no puede sumar más que la cabecera del reembolso.
--     Diferido: las líneas se insertan después de la cabecera, así que la
--     comprobación tiene que esperar al COMMIT.
create or replace function public.validar_total_reembolso()
returns trigger
language plpgsql
as $$
declare
  v_reembolso uuid := coalesce(new.reembolso_id, old.reembolso_id);
  v_cabecera  numeric(12, 2);
  v_lineas    numeric(12, 2);
begin
  select r.importe_eur into v_cabecera
  from public.reembolsos r where r.id = v_reembolso;

  -- La cabecera pudo borrarse en cascada: entonces no hay nada que validar.
  if v_cabecera is null then return null; end if;

  select coalesce(sum(rm.importe_eur), 0) into v_lineas
  from public.reembolso_movimientos rm where rm.reembolso_id = v_reembolso;

  if v_lineas > v_cabecera then
    raise exception
      'El desglose (% €) supera el importe del reembolso (% €).',
      v_lineas, v_cabecera;
  end if;

  return null;
end;
$$;

drop trigger if exists validar_total_reembolso on public.reembolso_movimientos;
create constraint trigger validar_total_reembolso
  after insert or update or delete on public.reembolso_movimientos
  deferrable initially deferred
  for each row execute function public.validar_total_reembolso();


-- 2.4 INMUTABILIDAD DEL CIERRE APROBADO.
--     Un acta firmada por los dos socios no se toca. La política de RLS sola
--     no basta: la service role key la esquivaría. Esto no.
create or replace function public.proteger_cierre_aprobado()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.estado = 'aprobado' then
      raise exception
        'El cierre «%» está aprobado por ambos socios y no se puede borrar.',
        old.etiqueta;
    end if;
    return old;
  end if;

  if old.estado = 'aprobado' then
    raise exception
      'El cierre «%» está aprobado por ambos socios y no se puede modificar.',
      old.etiqueta;
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_cierre on public.cierres;
create trigger proteger_cierre
  before update or delete on public.cierres
  for each row execute function public.proteger_cierre_aprobado();


-- ───────────────────────────────────────────────────────────────────────────
-- 3. SEGURIDAD
-- ───────────────────────────────────────────────────────────────────────────

alter table public.reembolsos            enable row level security;
alter table public.reembolso_movimientos enable row level security;
alter table public.cierres               enable row level security;

revoke all on public.reembolsos            from anon;
revoke all on public.reembolso_movimientos from anon;
revoke all on public.cierres               from anon;

-- reembolsos
drop policy if exists reembolsos_select on public.reembolsos;
create policy reembolsos_select on public.reembolsos
  for select to authenticated using (public.es_socio_activo());

drop policy if exists reembolsos_insert on public.reembolsos;
create policy reembolsos_insert on public.reembolsos
  for insert to authenticated with check (public.es_socio_activo());

drop policy if exists reembolsos_update on public.reembolsos;
create policy reembolsos_update on public.reembolsos
  for update to authenticated
  using (public.es_socio_activo()) with check (public.es_socio_activo());

drop policy if exists reembolsos_delete on public.reembolsos;
create policy reembolsos_delete on public.reembolsos
  for delete to authenticated using (public.es_socio_activo());

-- reembolso_movimientos
drop policy if exists reembolso_mov_select on public.reembolso_movimientos;
create policy reembolso_mov_select on public.reembolso_movimientos
  for select to authenticated using (public.es_socio_activo());

drop policy if exists reembolso_mov_insert on public.reembolso_movimientos;
create policy reembolso_mov_insert on public.reembolso_movimientos
  for insert to authenticated with check (public.es_socio_activo());

drop policy if exists reembolso_mov_update on public.reembolso_movimientos;
create policy reembolso_mov_update on public.reembolso_movimientos
  for update to authenticated
  using (public.es_socio_activo()) with check (public.es_socio_activo());

drop policy if exists reembolso_mov_delete on public.reembolso_movimientos;
create policy reembolso_mov_delete on public.reembolso_movimientos
  for delete to authenticated using (public.es_socio_activo());

-- cierres. Además del trigger, la política impide tocar lo aprobado.
drop policy if exists cierres_select on public.cierres;
create policy cierres_select on public.cierres
  for select to authenticated using (public.es_socio_activo());

drop policy if exists cierres_insert on public.cierres;
create policy cierres_insert on public.cierres
  for insert to authenticated with check (public.es_socio_activo());

drop policy if exists cierres_update on public.cierres;
create policy cierres_update on public.cierres
  for update to authenticated
  using (public.es_socio_activo() and estado = 'borrador')
  with check (public.es_socio_activo());

drop policy if exists cierres_delete on public.cierres;
create policy cierres_delete on public.cierres
  for delete to authenticated
  using (public.es_socio_activo() and estado = 'borrador');


-- ───────────────────────────────────────────────────────────────────────────
-- 4. SEMILLAS DE AJUSTES
-- ───────────────────────────────────────────────────────────────────────────

insert into public.ajustes (clave, valor) values
  -- R5: reinversión del 100 % durante los 3 primeros meses.
  ('fase_inicial',      '{"inicio": "2026-09-07", "meses": 3}'::jsonb),
  -- R6: socio_id a null hasta que se indique a cuál de los dos aplica.
  ('limite_aportacion', '{"socio_id": null, "importe": 3000}'::jsonb),
  ('aviso_limite_pct',  '{"porcentaje": 80}'::jsonb)
on conflict (clave) do nothing;
