-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — Cobros de la pasarela (payouts de Shopify) y saldo en banco
--
-- LA IDEA
--   Las ventas ya entran como ingreso en /diario. El payout de Shopify NO es
--   un ingreso nuevo: es el cobro de esas mismas ventas con las comisiones
--   descontadas. Registrarlo como ingreso duplicaría la facturación.
--   Lo único nuevo que trae un payout son sus gastos: la comisión y, si las
--   hay, las devoluciones. Eso es lo que se registra.
--
-- QUÉ CAMBIA
--   1. Tabla `cobros_pasarela`, con el desglose del payout. El neto tiene que
--      cuadrar con el desglose o la fila no entra (CHECK).
--   2. Al guardar un cobro se generan sus gastos en `movimientos`, en la misma
--      transacción, por disparador. Al editarlo se ajustan; al borrarlo se
--      borran. Nunca se crea un ingreso.
--   3. `vw_cobros_conciliacion`: cada cobro contra las ventas de /diario de
--      los días que cubre. Así salen los días olvidados.
--   4. El saldo de caja se parte en dos (`fn_saldo_banco`):
--        SALDO EN BANCO      = saldo inicial + netos cobrados
--                              − gastos pagados por el negocio
--                                (sin los generados por cobros, que ya van
--                                restados dentro del neto)
--                              − reembolsos pagados a socios
--        PENDIENTE EN SHOPIFY = ventas registradas − brutos ya cobrados
--      Antes el saldo era saldo inicial + ingresos − gastos: daba por cobrado
--      dinero que seguía en Shopify y restaba gastos que había pagado un
--      socio de su bolsillo.
--   5. `fn_estado_liquidacion` usa el saldo en banco como caja disponible.
--
-- Los gastos anticipados por un socio NO restan del banco: no salieron de la
-- cuenta del negocio. Lo que sí sale del banco es su reembolso, cuando se paga.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABLA
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.cobros_pasarela (
  id                       uuid primary key default gen_random_uuid(),
  fecha_cobro              date not null,
  periodo_desde            date not null,
  periodo_hasta            date not null,
  plataforma               text not null default 'Shopify Payments',
  importe_bruto            numeric(12, 2) not null,
  comisiones               numeric(12, 2) not null default 0,
  devoluciones             numeric(12, 2) not null default 0,
  otros_ajustes            numeric(12, 2) not null default 0,
  importe_neto             numeric(12, 2) not null,
  referencia               text,
  notas                    text,

  -- Gastos generados. La clave foránea es diferida: el disparador de edición
  -- puede borrar el gasto antes de soltar la referencia en la misma
  -- transacción, y la comprobación se hace al confirmar.
  movimiento_comision_id   uuid references public.movimientos (id)
                             deferrable initially deferred,
  movimiento_devolucion_id uuid references public.movimientos (id)
                             deferrable initially deferred,

  created_by               uuid not null default auth.uid()
                             references public.profiles (id),
  created_at               timestamptz default now(),

  constraint cobros_neto_cuadra check (
    importe_neto = importe_bruto - comisiones - devoluciones + otros_ajustes
  ),
  constraint cobros_importes_positivos check (
    importe_bruto >= 0 and comisiones >= 0 and devoluciones >= 0
  ),
  constraint cobros_periodo_ordenado check (periodo_desde <= periodo_hasta),
  constraint cobros_plataforma_no_vacia check (length(trim(plataforma)) > 0)
);

comment on table public.cobros_pasarela is
  'Payouts de la pasarela al banco. NO son ingresos: cobran ventas ya registradas '
  'en /diario. Generan los gastos de comisión y devoluciones.';
comment on column public.cobros_pasarela.fecha_cobro is
  'Día en que el dinero llegó al banco.';
comment on column public.cobros_pasarela.periodo_desde is
  'Primer día de ventas que cubre el payout.';
comment on column public.cobros_pasarela.importe_neto is
  'Lo que llegó al banco. Debe cuadrar: bruto − comisiones − devoluciones + otros ajustes.';
comment on column public.cobros_pasarela.referencia is
  'Id del payout en Shopify. Único por plataforma: evita registrar dos veces el mismo.';
comment on column public.cobros_pasarela.movimiento_comision_id is
  'Gasto de comisión generado. Lo crea, ajusta y borra el propio cobro.';

create index if not exists cobros_fecha_idx
  on public.cobros_pasarela (fecha_cobro desc);

-- El mismo payout no se registra dos veces.
create unique index if not exists cobros_referencia_unica
  on public.cobros_pasarela (plataforma, referencia)
  where referencia is not null;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. GASTOS GENERADOS
-- ───────────────────────────────────────────────────────────────────────────

-- 2.1 Crea, actualiza o borra UN gasto generado y devuelve su id (o null).
--     Se imputa por su importe, sin IVA: la comisión de la pasarela es un
--     servicio financiero y el desglose fiscal lo hace la gestoría.
create or replace function public.fn_cobro_sincronizar_gasto(
  p_movimiento uuid,
  p_importe    numeric,
  p_categoria  text,
  p_concepto   text,
  p_fecha      date,
  p_autor      uuid
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
      anticipado_por, notas, created_by
    )
    values (
      'gasto', p_fecha, p_concepto, v_categoria, 'EUR',
      p_importe, 0, 0, p_importe,
      1, p_importe, p_importe,
      null,  -- lo pagó el negocio: se descontó solo del payout
      'Generado automáticamente por un cobro de la pasarela. Se modifica desde /cobros.',
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
           anticipado_por = null
     where id = v_id;
  end if;

  return v_id;
end;
$$;


-- 2.2 Disparador del cobro: genera, ajusta y borra sus gastos.
create or replace function public.cobros_generar_gastos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_etiqueta text;
  v_sufijo   text;
begin
  -- Deja pasar las escrituras sobre los gastos generados (ver 2.3).
  perform set_config('app.cobro_sincronizando', 'on', true);

  if tg_op = 'DELETE' then
    delete from public.movimientos
     where id in (old.movimiento_comision_id, old.movimiento_devolucion_id);
    perform set_config('app.cobro_sincronizando', 'off', true);
    return old;
  end if;

  v_etiqueta := case
    when new.plataforma ilike 'shopify%' then 'Shopify'
    else new.plataforma
  end;
  v_sufijo := ' — pago del ' || to_char(new.fecha_cobro, 'DD/MM');

  new.movimiento_comision_id := public.fn_cobro_sincronizar_gasto(
    case when tg_op = 'UPDATE' then old.movimiento_comision_id end,
    new.comisiones,
    'Comisiones pasarela de pago',
    'Comisiones ' || v_etiqueta || v_sufijo,
    new.fecha_cobro,
    new.created_by
  );

  new.movimiento_devolucion_id := public.fn_cobro_sincronizar_gasto(
    case when tg_op = 'UPDATE' then old.movimiento_devolucion_id end,
    new.devoluciones,
    'Devoluciones y reembolsos',
    'Devoluciones ' || v_etiqueta || v_sufijo,
    new.fecha_cobro,
    new.created_by
  );

  perform set_config('app.cobro_sincronizando', 'off', true);
  return new;
end;
$$;

drop trigger if exists cobros_generar_gastos on public.cobros_pasarela;
create trigger cobros_generar_gastos
  before insert or update on public.cobros_pasarela
  for each row execute function public.cobros_generar_gastos();

drop trigger if exists cobros_borrar_gastos on public.cobros_pasarela;
create trigger cobros_borrar_gastos
  after delete on public.cobros_pasarela
  for each row execute function public.cobros_generar_gastos();


-- 2.3 Un gasto generado no se toca por su cuenta.
--     Si alguien cambiase la comisión desde /movimientos, el cobro diría una
--     cosa y la cuenta de resultados otra. Se cambia desde el cobro, o no se
--     cambia.
create or replace function public.proteger_gasto_de_cobro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fecha date;
begin
  if coalesce(current_setting('app.cobro_sincronizando', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;

  select c.fecha_cobro into v_fecha
  from public.cobros_pasarela c
  where old.id in (c.movimiento_comision_id, c.movimiento_devolucion_id);

  if v_fecha is not null then
    raise exception
      'Este gasto lo generó el cobro del %. Se modifica o se borra desde /cobros.',
      to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists proteger_gasto_de_cobro on public.movimientos;
create trigger proteger_gasto_de_cobro
  before update or delete on public.movimientos
  for each row execute function public.proteger_gasto_de_cobro();


-- ───────────────────────────────────────────────────────────────────────────
-- 3. SEGURIDAD — como el resto: los dos leen y crean, solo el autor edita o
--    borra. La autoría es la firma y se fija en la política (ver 0013).
-- ───────────────────────────────────────────────────────────────────────────

alter table public.cobros_pasarela enable row level security;
revoke all on public.cobros_pasarela from anon;

drop policy if exists cobros_pasarela_select on public.cobros_pasarela;
create policy cobros_pasarela_select on public.cobros_pasarela
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists cobros_pasarela_insert on public.cobros_pasarela;
create policy cobros_pasarela_insert on public.cobros_pasarela
  for insert to authenticated
  with check (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists cobros_pasarela_update on public.cobros_pasarela;
create policy cobros_pasarela_update on public.cobros_pasarela
  for update to authenticated
  using       (public.es_socio_activo() and created_by = auth.uid())
  with check  (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists cobros_pasarela_delete on public.cobros_pasarela;
create policy cobros_pasarela_delete on public.cobros_pasarela
  for delete to authenticated
  using (public.es_socio_activo() and created_by = auth.uid());

grant select, insert, update, delete on public.cobros_pasarela to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. CONCILIACIÓN — cada cobro contra las ventas de /diario que cubre
--
-- Ventas = ingresos de la categoría «Ventas Shopify» (lo que escribe /diario
-- y lo que agrupa por día la importación de CSV), en euros.
-- ───────────────────────────────────────────────────────────────────────────

drop view if exists public.vw_cobros_conciliacion;
create view public.vw_cobros_conciliacion
with (security_invoker = true) as
select
  c.*,
  coalesce(v.ventas, 0)                              as ventas_registradas,
  round(c.importe_bruto - coalesce(v.ventas, 0), 2)  as diferencia,
  abs(c.importe_bruto - coalesce(v.ventas, 0)) < 0.005 as cuadra,
  case when c.importe_bruto > 0
       then round(c.comisiones / c.importe_bruto * 100, 2)
  end                                                as pct_comision,
  p.nombre                                           as autor_nombre
from public.cobros_pasarela c
left join public.profiles p on p.id = c.created_by
left join lateral (
  select round(sum(m.total_eur), 2) as ventas
  from public.movimientos m
  join public.categorias cat on cat.id = m.categoria_id
  where m.tipo = 'ingreso'
    and cat.nombre = 'Ventas Shopify'
    and m.fecha between c.periodo_desde and c.periodo_hasta
) v on true;

comment on view public.vw_cobros_conciliacion is
  'Cada cobro con las ventas de /diario de su periodo. diferencia > 0: faltan '
  'ventas por registrar; < 0: hay más registrado de lo que Shopify cobró.';

-- Las ventas de un rango, para conciliar ANTES de guardar.
create or replace function public.fn_ventas_registradas(p_desde date, p_hasta date)
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
    and m.fecha between p_desde and p_hasta;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. SALDO EN BANCO Y PENDIENTE EN SHOPIFY
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_saldo_banco(p_fecha_corte date default current_date)
returns table (
  saldo_inicial     numeric,
  fecha_inicial     date,
  cobrado_neto      numeric,
  gastos_negocio    numeric,
  reembolsos        numeric,
  saldo_banco       numeric,
  ventas            numeric,
  cobrado_bruto     numeric,
  pendiente_shopify numeric
)
language sql
stable
set search_path = public
as $$
  with ajuste as (
    select
      coalesce((valor ->> 'importe')::numeric, 0) as importe,
      (valor ->> 'fecha')::date                  as desde
    from public.ajustes
    where clave = 'saldo_inicial'
  ),
  -- Sin fila de ajustes se parte de cero desde la fecha de corte.
  base as (
    select
      coalesce((select importe from ajuste), 0)            as importe,
      coalesce((select desde from ajuste), p_fecha_corte)  as desde
  ),
  cobros as (
    select
      coalesce(sum(c.importe_neto), 0)  as neto,
      coalesce(sum(c.importe_bruto), 0) as bruto
    from public.cobros_pasarela c, base b
    where c.fecha_cobro >= b.desde and c.fecha_cobro <= p_fecha_corte
  ),
  generados as (
    select movimiento_comision_id as id from public.cobros_pasarela
     where movimiento_comision_id is not null
    union all
    select movimiento_devolucion_id from public.cobros_pasarela
     where movimiento_devolucion_id is not null
  ),
  mov as (
    select
      coalesce(sum(m.total_eur) filter (
        where m.tipo = 'gasto'
          and m.anticipado_por is null
          and m.id not in (select id from generados)
      ), 0) as gastos_negocio,
      coalesce(sum(m.total_eur) filter (
        where m.tipo = 'ingreso' and cat.nombre = 'Ventas Shopify'
      ), 0) as ventas
    from public.movimientos m
    join public.categorias cat on cat.id = m.categoria_id, base b
    where m.fecha >= b.desde and m.fecha <= p_fecha_corte
  ),
  reemb as (
    select coalesce(sum(r.importe_eur), 0) as total
    from public.reembolsos r, base b
    where r.fecha >= b.desde and r.fecha <= p_fecha_corte
  )
  select
    round(b.importe, 2),
    b.desde,
    round(cobros.neto, 2),
    round(mov.gastos_negocio, 2),
    round(reemb.total, 2),
    round(b.importe + cobros.neto - mov.gastos_negocio - reemb.total, 2),
    round(mov.ventas, 2),
    round(cobros.bruto, 2),
    round(mov.ventas - cobros.bruto, 2)
  from base b, cobros, mov, reemb;
$$;

comment on function public.fn_saldo_banco(date) is
  'Saldo en banco = saldo inicial + netos cobrados − gastos pagados por el negocio '
  '− reembolsos a socios. Pendiente en Shopify = ventas − brutos cobrados.';

-- El saldo antiguo daba por cobrado lo que seguía en Shopify. Se retira para
-- que nadie vuelva a leerlo por error.
drop function if exists public.fn_saldo_caja();


-- ───────────────────────────────────────────────────────────────────────────
-- 6. LIQUIDACIÓN — la caja disponible es el saldo en banco
--
-- Mismo cuerpo que en 0005; solo cambia el bloque «Caja disponible».
-- ───────────────────────────────────────────────────────────────────────────

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

  -- Caja disponible a la fecha de corte: el saldo en banco (0015). Ni las
  -- ventas que siguen en Shopify ni los gastos que adelantó un socio mueven
  -- el banco.
  select b.saldo_banco into v_caja from public.fn_saldo_banco(p_fecha_corte) b;
  v_caja := coalesce(v_caja, 0);

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
  'Foto de la liquidación a una fecha: resultado, pérdidas, anticipos, caja (saldo en banco) y '
  'si se puede repartir (R3, R4, R5).';

-- ───────────────────────────────────────────────────────────────────────────
-- 7. PERMISOS
-- ───────────────────────────────────────────────────────────────────────────

revoke all on public.vw_cobros_conciliacion from anon;
grant select on public.vw_cobros_conciliacion to authenticated;

-- Las funciones del cobro las llama su disparador por cuenta de quien escribe,
-- así que necesitan EXECUTE para `authenticated`. No elevan nada: son
-- SECURITY INVOKER y la RLS de movimientos sigue mandando.
revoke all on function public.fn_cobro_sincronizar_gasto(uuid, numeric, text, text, date, uuid) from public, anon;
revoke all on function public.cobros_generar_gastos()         from public, anon;
revoke all on function public.proteger_gasto_de_cobro()       from public, anon;
revoke all on function public.fn_ventas_registradas(date, date) from public, anon;
revoke all on function public.fn_saldo_banco(date)            from public, anon;

grant execute on function public.fn_cobro_sincronizar_gasto(uuid, numeric, text, text, date, uuid) to authenticated;
grant execute on function public.cobros_generar_gastos()         to authenticated;
grant execute on function public.proteger_gasto_de_cobro()       to authenticated;
grant execute on function public.fn_ventas_registradas(date, date) to authenticated;
grant execute on function public.fn_saldo_banco(date)            to authenticated;
