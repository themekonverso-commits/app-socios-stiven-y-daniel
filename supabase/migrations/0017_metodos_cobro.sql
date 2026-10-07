-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — Dos métodos de cobro: Shopify Payments y PayPal
--
-- POR QUÉ
--   Shopify Payments y PayPal cobran distinto y la app los mezclaba:
--     · Shopify Payments paga al BANCO una vez por semana (los miércoles),
--       agrupando las ventas de la semana anterior.
--     · PayPal deja el dinero en la CUENTA DE PAYPAL el mismo día de la venta.
--       Llega al banco solo cuando lo traspasamos nosotros.
--   Comparar un payout de Shopify contra el total del día daba descuadres
--   falsos (faltaba restar PayPal), y la caja contaba como banco un dinero que
--   estaba en PayPal.
--
-- QUÉ CAMBIA
--   1. `movimientos.metodo_cobro` ('shopify_payments' | 'paypal') en las
--      ventas. NO se usa `plataforma`, que es para publicidad. Las ventas que
--      ya había se asignan a Shopify Payments y sus días quedan anotados en
--      ajustes.revision_metodo_cobro para revisarlos a mano en /diario.
--   2. `movimientos.cuenta_pago` ('banco' | 'paypal') en los gastos pagados
--      por el negocio, y `reembolsos.cuenta_pago` en los reembolsos.
--   3. `fn_registrar_ventas_dia`: el alta de /diario con un movimiento por
--      método, en una transacción. El total del día es la suma: facturación,
--      pedidos, ticket medio y todos los KPI salen igual que antes.
--   4. `cobros_pasarela.plataforma` pasa a ser 'Shopify Payments' | 'PayPal'
--      y cada cobro concilia SOLO con las ventas de su método. Los solapes
--      (posibles duplicados) se buscan solo dentro de la misma plataforma.
--   5. `traspasos_paypal`: PayPal → Banco. No es ingreso ni gasto; solo mueve
--      saldo. Si PayPal cobra comisión por el traspaso, esa parte sí es gasto.
--   6. `fn_tesoreria` sustituye a `fn_saldo_banco`: saldo en banco, saldo en
--      PayPal y pendiente de cobro por método. `fn_estado_liquidacion` toma
--      como caja disponible banco + PayPal.
--
-- LO QUE NO CAMBIA
--   Ningún importe existente. La migración no crea, borra ni modifica dinero:
--   solo rellena las dos columnas nuevas.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. COLUMNAS NUEVAS EN MOVIMIENTOS
-- ───────────────────────────────────────────────────────────────────────────

alter table public.movimientos
  add column if not exists metodo_cobro text,
  add column if not exists cuenta_pago  text;

comment on column public.movimientos.metodo_cobro is
  'Solo en ventas (ingresos de «Ventas Shopify»): shopify_payments o paypal. '
  'No confundir con `plataforma`, que es la red de publicidad.';
comment on column public.movimientos.cuenta_pago is
  'Solo en gastos pagados por el negocio (anticipado_por NULL): banco o paypal. '
  'NULL si lo adelantó un socio: ese dinero no salió de ninguna cuenta del negocio.';

-- 1.1 Relleno de lo que ya existía.
--     · Ventas → Shopify Payments (se revisan a mano los días con PayPal).
--     · Gastos del negocio → Banco, que era lo único que existía.
--     Sin tocar updated_at (no es una edición de nadie) y sin que el escudo de
--     los gastos generados por cobros lo impida (no cambia ningún importe).
alter table public.movimientos disable trigger set_updated_at;
select set_config('app.cobro_sincronizando', 'on', true);

update public.movimientos m
   set metodo_cobro = 'shopify_payments'
  from public.categorias c
 where c.id = m.categoria_id
   and m.tipo = 'ingreso'
   and c.nombre = 'Ventas Shopify'
   and m.metodo_cobro is null;

update public.movimientos
   set cuenta_pago = 'banco'
 where tipo = 'gasto'
   and anticipado_por is null
   and cuenta_pago is null;

select set_config('app.cobro_sincronizando', 'off', true);
alter table public.movimientos enable trigger set_updated_at;

-- 1.2 Reglas.
alter table public.movimientos
  drop constraint if exists movimientos_metodo_cobro_valido,
  drop constraint if exists movimientos_metodo_solo_ingresos,
  drop constraint if exists movimientos_cuenta_pago_valida,
  drop constraint if exists movimientos_cuenta_solo_negocio;

alter table public.movimientos
  add constraint movimientos_metodo_cobro_valido
    check (metodo_cobro in ('shopify_payments', 'paypal')),
  add constraint movimientos_metodo_solo_ingresos
    check (metodo_cobro is null or tipo = 'ingreso'),
  add constraint movimientos_cuenta_pago_valida
    check (cuenta_pago in ('banco', 'paypal')),
  add constraint movimientos_cuenta_solo_negocio
    check (cuenta_pago is null or (tipo = 'gasto' and anticipado_por is null));

create index if not exists movimientos_fecha_metodo_idx
  on public.movimientos (fecha, metodo_cobro)
  where metodo_cobro is not null;

-- 1.3 Valores por defecto, en la base de datos y no en cada pantalla.
--     Así la importación de CSV, el inventario de cuentas y el formulario de
--     movimientos siguen funcionando sin saber nada de esto:
--       · una venta sin método es de Shopify Payments;
--       · un gasto del negocio sin cuenta sale del banco;
--       · un anticipo de socio no sale de ninguna cuenta.
create or replace function public.normalizar_cuentas_movimiento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tipo = 'ingreso' then
    new.cuenta_pago := null;
    if new.metodo_cobro is null and exists (
      select 1 from public.categorias c
       where c.id = new.categoria_id and c.nombre = 'Ventas Shopify'
    ) then
      new.metodo_cobro := 'shopify_payments';
    end if;
  else
    new.metodo_cobro := null;
    if new.anticipado_por is null then
      new.cuenta_pago := coalesce(new.cuenta_pago, 'banco');
    else
      new.cuenta_pago := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists normalizar_cuentas on public.movimientos;
create trigger normalizar_cuentas
  before insert or update on public.movimientos
  for each row execute function public.normalizar_cuentas_movimiento();


-- ───────────────────────────────────────────────────────────────────────────
-- 2. REEMBOLSOS: desde qué cuenta se pagan
-- ───────────────────────────────────────────────────────────────────────────

alter table public.reembolsos
  add column if not exists cuenta_pago text not null default 'banco';

alter table public.reembolsos
  drop constraint if exists reembolsos_cuenta_pago_valida;
alter table public.reembolsos
  add constraint reembolsos_cuenta_pago_valida
    check (cuenta_pago in ('banco', 'paypal'));

comment on column public.reembolsos.cuenta_pago is
  'Cuenta del negocio de la que salió el reembolso: banco o paypal.';

-- Misma función que en la 0007, con la cuenta como último parámetro. Se borra
-- la firma vieja: con dos versiones, PostgREST no sabría a cuál llamar.
drop function if exists public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb);

create or replace function public.fn_registrar_reembolso(
  p_socio_id uuid,
  p_fecha    date,
  p_importe  numeric,
  p_metodo   text default null,
  p_notas    text default null,
  p_lineas   jsonb default '[]'::jsonb,
  p_cuenta   text default 'banco'
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

  if coalesce(p_cuenta, 'banco') not in ('banco', 'paypal') then
    raise exception 'La cuenta de pago tiene que ser banco o paypal.';
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

  insert into public.reembolsos (
    fecha, socio_id, importe_eur, metodo, notas, cuenta_pago, created_by)
  values (
    p_fecha, p_socio_id, round(p_importe, 2), p_metodo, p_notas,
    coalesce(p_cuenta, 'banco'), v_actor)
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

comment on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb, text) is
  'Registra un reembolso a un socio y lo reparte entre sus anticipos. p_cuenta: '
  'cuenta del negocio de la que sale (banco por defecto).';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. AJUSTES: saldo inicial de PayPal y días por revisar
-- ───────────────────────────────────────────────────────────────────────────

-- Mismo formato que el del banco. Empieza en 0 y en la misma fecha: si en
-- PayPal había dinero ese día, se corrige en /ajustes.
insert into public.ajustes (clave, valor)
select 'saldo_inicial_paypal',
       jsonb_build_object(
         'importe', 0,
         'fecha', coalesce(
           (select valor ->> 'fecha' from public.ajustes where clave = 'saldo_inicial'),
           to_char(current_date, 'YYYY-MM-DD')))
on conflict (clave) do nothing;

-- Los días con ventas registradas ANTES del cambio. Se asignaron a Shopify
-- Payments; /diario los lista para revisar a mano los que tuvieron PayPal.
insert into public.ajustes (clave, valor)
select 'revision_metodo_cobro',
       jsonb_build_object(
         'aplicado', to_char(current_date, 'YYYY-MM-DD'),
         'revisado', false,
         'dias', coalesce((
           select jsonb_agg(d.fecha order by d.fecha)
           from (
             select distinct to_char(m.fecha, 'YYYY-MM-DD') as fecha
             from public.movimientos m
             where m.metodo_cobro is not null
           ) d
         ), '[]'::jsonb))
on conflict (clave) do nothing;

comment on column public.ajustes.valor is
  'saldo_inicial / saldo_inicial_paypal → {"importe": number, "fecha": "YYYY-MM-DD"} · '
  'objetivo_mes → {"facturacion": number, "beneficio": number} · '
  'revision_metodo_cobro → {"aplicado": fecha, "revisado": bool, "dias": [fechas]}';


-- ───────────────────────────────────────────────────────────────────────────
-- 4. /diario — las ventas del día, un movimiento por método
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_registrar_ventas_dia(
  p_fecha            date,
  p_divisa           text,
  p_tasa             numeric,
  p_shopify_importe  numeric,
  p_shopify_pedidos  int,
  p_paypal_importe   numeric,
  p_paypal_pedidos   int,
  p_sobrescribir     boolean default false
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
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
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

  -- Lo que ya hay ese día (mismo criterio que la tabla de /diario).
  select coalesce(jsonb_agg(jsonb_build_object(
           'metodo', m.metodo_cobro,
           'importe', m.total,
           'pedidos', m.num_pedidos) order by m.metodo_cobro), '[]'::jsonb)
    into v_existentes
  from public.movimientos m
  where m.fecha = p_fecha and m.categoria_id = v_categoria
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
        and m.tipo = 'ingreso' and m.num_pedidos is not null
        and m.metodo_cobro = v_metodo
      order by m.created_at
    loop
      -- ¿Hace falta tocar esta fila? Solo si cambia algo o sobra.
      if v_primero is null and v_importe > 0
         and v_fila.total = v_importe and v_fila.num_pedidos = v_pedidos
         and v_fila.divisa = coalesce(p_divisa, 'EUR') and v_fila.tasa_cambio = v_tasa then
        v_primero := v_fila.id;
        continue;
      end if;

      -- La RLS no lanza error: bloquearía en silencio. Se avisa antes.
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
      -- Las ventas van por su importe bruto: el desglose de IVA lo hace la
      -- gestoría. total_eur lo calcula calcular_importes_movimiento().
      insert into public.movimientos (
        tipo, fecha, concepto, categoria_id, divisa,
        base_imponible, iva_tipo, iva_importe, total,
        tasa_cambio, total_eur, base_eur,
        anticipado_por, num_pedidos, metodo_cobro, created_by
      )
      values (
        'ingreso', p_fecha,
        'Ventas del ' || to_char(p_fecha, 'DD/MM/YYYY') || ' · ' || v_etiqueta,
        v_categoria, coalesce(p_divisa, 'EUR'),
        v_importe, 0, 0, v_importe,
        v_tasa, round(v_importe * v_tasa, 2), round(v_importe * v_tasa, 2),
        null, v_pedidos, v_metodo, v_actor
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

comment on function public.fn_registrar_ventas_dia(date, text, numeric, numeric, int, numeric, int, boolean) is
  'Alta de /diario: un ingreso por método de cobro (Shopify Payments y PayPal). '
  'Si el día ya tiene ventas devuelve duplicado=true y no toca nada, salvo que '
  'p_sobrescribir. Un método a cero borra su movimiento del día.';


-- ───────────────────────────────────────────────────────────────────────────
-- 5. COBROS: plataforma cerrada y método derivado
-- ───────────────────────────────────────────────────────────────────────────

alter table public.cobros_pasarela
  drop constraint if exists cobros_plataforma_no_vacia,
  drop constraint if exists cobros_plataforma_valida;

alter table public.cobros_pasarela
  add constraint cobros_plataforma_valida
    check (plataforma in ('Shopify Payments', 'PayPal'));

-- El método de cobro, con los mismos valores que en movimientos. Columna
-- generada: no hay forma de que la plataforma diga una cosa y el método otra.
alter table public.cobros_pasarela
  add column if not exists metodo_cobro text
    generated always as (
      case when plataforma = 'PayPal' then 'paypal' else 'shopify_payments' end
    ) stored;

comment on column public.cobros_pasarela.fecha_cobro is
  'Shopify Payments: día en que llegó al banco. PayPal: día en que llegó a la cuenta de PayPal.';
comment on column public.cobros_pasarela.importe_neto is
  'Lo que llegó a la cuenta (banco en Shopify, PayPal en PayPal). '
  'Debe cuadrar: bruto − comisiones − devoluciones + otros ajustes.';
comment on column public.cobros_pasarela.metodo_cobro is
  'Derivado de la plataforma. Concilia solo con las ventas de este método.';

create index if not exists cobros_metodo_periodo_idx
  on public.cobros_pasarela (metodo_cobro, periodo_desde, periodo_hasta);


-- 5.1 Los gastos generados llevan su cuenta. Es informativo: se excluyen de
--     los saldos igualmente, porque el neto del cobro ya los lleva restados.
drop function if exists public.fn_cobro_sincronizar_gasto(uuid, numeric, text, text, date, uuid);

create or replace function public.fn_cobro_sincronizar_gasto(
  p_movimiento uuid,
  p_importe    numeric,
  p_categoria  text,
  p_concepto   text,
  p_fecha      date,
  p_autor      uuid,
  p_cuenta     text default 'banco'
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
      anticipado_por, cuenta_pago, notas, created_by
    )
    values (
      'gasto', p_fecha, p_concepto, v_categoria, 'EUR',
      p_importe, 0, 0, p_importe,
      1, p_importe, p_importe,
      null,  -- lo pagó el negocio: se descontó solo del cobro
      p_cuenta,
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
           cuenta_pago    = p_cuenta
     where id = v_id;
  end if;

  return v_id;
end;
$$;


-- 5.2 Disparador del cobro, con los conceptos de PayPal.
--     Shopify: «Comisiones Shopify — pago del 07/10» (como hasta ahora).
--     PayPal:  «Comisiones PayPal — 07/10».
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

  new.movimiento_comision_id := public.fn_cobro_sincronizar_gasto(
    case when tg_op = 'UPDATE' then old.movimiento_comision_id end,
    new.comisiones,
    'Comisiones pasarela de pago',
    'Comisiones ' || v_etiqueta || v_sufijo,
    new.fecha_cobro,
    new.created_by,
    v_cuenta
  );

  new.movimiento_devolucion_id := public.fn_cobro_sincronizar_gasto(
    case when tg_op = 'UPDATE' then old.movimiento_devolucion_id end,
    new.devoluciones,
    'Devoluciones y reembolsos',
    'Devoluciones ' || v_etiqueta || v_sufijo,
    new.fecha_cobro,
    new.created_by,
    v_cuenta
  );

  perform set_config('app.cobro_sincronizando', 'off', true);
  return new;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. TRASPASOS PAYPAL → BANCO
--
--    No es ingreso ni gasto: el dinero ya era del negocio y solo cambia de
--    cuenta. PayPal baja en `importe`, el banco sube en `importe_neto`.
--    Si PayPal cobra por el traspaso, la diferencia es un gasto de comisión,
--    que se genera solo, igual que en los cobros.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.traspasos_paypal (
  id                     uuid primary key default gen_random_uuid(),
  fecha                  date not null,
  importe                numeric(12, 2) not null,
  comision               numeric(12, 2) not null default 0,
  importe_neto           numeric(12, 2) not null,
  referencia             text,
  notas                  text,
  movimiento_comision_id uuid references public.movimientos (id)
                           deferrable initially deferred,
  created_by             uuid not null default auth.uid()
                           references public.profiles (id),
  created_at             timestamptz default now(),

  constraint traspasos_neto_cuadra check (importe_neto = importe - comision),
  constraint traspasos_importes_validos check (
    importe > 0 and comision >= 0 and comision < importe
  )
);

comment on table public.traspasos_paypal is
  'Paso de dinero de la cuenta de PayPal al banco. No es ingreso ni gasto: solo '
  'mueve saldo. La comisión del traspaso, si la hay, sí es gasto (se genera sola).';
comment on column public.traspasos_paypal.importe is 'Lo que sale de PayPal.';
comment on column public.traspasos_paypal.importe_neto is
  'Lo que llega al banco: importe − comisión.';

create index if not exists traspasos_fecha_idx
  on public.traspasos_paypal (fecha desc);

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
    'paypal'
  );

  perform set_config('app.cobro_sincronizando', 'off', true);
  return new;
end;
$$;

drop trigger if exists traspasos_generar_gasto on public.traspasos_paypal;
create trigger traspasos_generar_gasto
  before insert or update on public.traspasos_paypal
  for each row execute function public.traspasos_generar_gasto();

drop trigger if exists traspasos_borrar_gasto on public.traspasos_paypal;
create trigger traspasos_borrar_gasto
  after delete on public.traspasos_paypal
  for each row execute function public.traspasos_generar_gasto();

-- Seguridad: la de siempre. Los dos leen y crean; solo el autor edita o borra.
alter table public.traspasos_paypal enable row level security;
revoke all on public.traspasos_paypal from anon;

drop policy if exists traspasos_paypal_select on public.traspasos_paypal;
create policy traspasos_paypal_select on public.traspasos_paypal
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists traspasos_paypal_insert on public.traspasos_paypal;
create policy traspasos_paypal_insert on public.traspasos_paypal
  for insert to authenticated
  with check (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists traspasos_paypal_update on public.traspasos_paypal;
create policy traspasos_paypal_update on public.traspasos_paypal
  for update to authenticated
  using       (public.es_socio_activo() and created_by = auth.uid())
  with check  (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists traspasos_paypal_delete on public.traspasos_paypal;
create policy traspasos_paypal_delete on public.traspasos_paypal
  for delete to authenticated
  using (public.es_socio_activo() and created_by = auth.uid());

grant select, insert, update, delete on public.traspasos_paypal to authenticated;


-- 6.1 El escudo de los gastos generados cubre también los traspasos.
create or replace function public.proteger_gasto_de_cobro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fecha date;
  v_que   text;
begin
  if coalesce(current_setting('app.cobro_sincronizando', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;

  select c.fecha_cobro, 'el cobro' into v_fecha, v_que
  from public.cobros_pasarela c
  where old.id in (c.movimiento_comision_id, c.movimiento_devolucion_id);

  if v_fecha is null then
    select t.fecha, 'el traspaso a banco' into v_fecha, v_que
    from public.traspasos_paypal t
    where t.movimiento_comision_id = old.id;
  end if;

  if v_fecha is not null then
    raise exception
      'Este gasto lo generó % del %. Se modifica o se borra desde /cobros.',
      v_que, to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  return coalesce(new, old);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 7. CONCILIACIÓN POR MÉTODO
-- ───────────────────────────────────────────────────────────────────────────

-- 7.1 Cada cobro contra las ventas de SU método en su periodo. Nunca contra el
--     total del día: un día con 100 € por Shopify y 40 € por PayPal no
--     descuadra el payout de Shopify de 100 €.
--     `solapados`: otros cobros de la MISMA plataforma cuyo periodo se cruza
--     con este. Es la señal de un posible duplicado. Un cobro de PayPal y uno
--     de Shopify del mismo periodo son lo normal y no aparecen aquí.
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
  p.nombre                                           as autor_nombre,
  coalesce(s.solapados, '[]'::jsonb)                 as solapados
from public.cobros_pasarela c
left join public.profiles p on p.id = c.created_by
left join lateral (
  select round(sum(m.total_eur), 2) as ventas
  from public.movimientos m
  join public.categorias cat on cat.id = m.categoria_id
  where m.tipo = 'ingreso'
    and cat.nombre = 'Ventas Shopify'
    and m.metodo_cobro = c.metodo_cobro
    and m.fecha between c.periodo_desde and c.periodo_hasta
) v on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
           'id', o.id,
           'fecha_cobro', o.fecha_cobro,
           'periodo_desde', o.periodo_desde,
           'periodo_hasta', o.periodo_hasta,
           'referencia', o.referencia) order by o.fecha_cobro) as solapados
  from public.cobros_pasarela o
  where o.id <> c.id
    and o.plataforma = c.plataforma
    and o.periodo_desde <= c.periodo_hasta
    and o.periodo_hasta >= c.periodo_desde
) s on true;

comment on view public.vw_cobros_conciliacion is
  'Cada cobro con las ventas de /diario de su MISMO método en su periodo. '
  'diferencia > 0: faltan ventas por registrar; < 0: hay más registrado de lo '
  'cobrado. solapados: cobros de la misma plataforma con periodo cruzado.';

-- 7.2 Las ventas de un rango y un método, para conciliar ANTES de guardar.
drop function if exists public.fn_ventas_registradas(date, date);

create or replace function public.fn_ventas_registradas(
  p_desde  date,
  p_hasta  date,
  p_metodo text default 'shopify_payments'
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
    and m.metodo_cobro = p_metodo
    and m.fecha between p_desde and p_hasta;
$$;

-- 7.3 Cobros de la misma plataforma que se solapan con un periodo (o que
--     llevan la misma referencia), para avisar ANTES de guardar.
create or replace function public.fn_cobros_solapados(
  p_plataforma text,
  p_desde      date,
  p_hasta      date,
  p_referencia text default null
)
returns table (
  id            uuid,
  fecha_cobro   date,
  periodo_desde date,
  periodo_hasta date,
  importe_bruto numeric,
  referencia    text,
  motivo        text
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
  where c.plataforma = p_plataforma
    and (
      (c.periodo_desde <= p_hasta and c.periodo_hasta >= p_desde)
      or (nullif(trim(p_referencia), '') is not null and c.referencia = trim(p_referencia))
    )
  order by c.fecha_cobro desc;
$$;

-- 7.4 Cobertura de las ventas: para cada día y método, si ya hay un cobro de
--     ese método cuyo periodo lo incluye. Alimenta el indicador de /diario y
--     el pendiente de cobro.
drop view if exists public.vw_ventas_cobertura;
create view public.vw_ventas_cobertura
with (security_invoker = true) as
select
  v.fecha,
  v.metodo_cobro,
  v.ventas,
  v.pedidos,
  c.id          as cobro_id,
  c.fecha_cobro as cobro_fecha,
  c.id is not null as cubierta
from (
  select m.fecha, m.metodo_cobro,
         round(sum(m.total_eur), 2)          as ventas,
         coalesce(sum(m.num_pedidos), 0)::int as pedidos
  from public.movimientos m
  join public.categorias cat on cat.id = m.categoria_id
  where m.tipo = 'ingreso'
    and cat.nombre = 'Ventas Shopify'
    and m.metodo_cobro is not null
  group by m.fecha, m.metodo_cobro
) v
left join lateral (
  select c.id, c.fecha_cobro
  from public.cobros_pasarela c
  where c.metodo_cobro = v.metodo_cobro
    and v.fecha between c.periodo_desde and c.periodo_hasta
  order by c.fecha_cobro desc
  limit 1
) c on true;

comment on view public.vw_ventas_cobertura is
  'Ventas por día y método, y el cobro de ese método que las cubre (si lo hay).';


-- ───────────────────────────────────────────────────────────────────────────
-- 8. TESORERÍA: banco, PayPal y pendiente de cobro
--
--   SALDO EN BANCO  = saldo inicial banco
--                     + netos de cobros Shopify Payments
--                     + traspasos desde PayPal (lo que llega)
--                     − gastos del negocio pagados desde el banco
--                     − reembolsos a socios pagados desde el banco
--   SALDO EN PAYPAL = saldo inicial PayPal
--                     + netos de cobros PayPal
--                     − traspasos al banco (lo que sale)
--                     − gastos del negocio pagados desde PayPal
--                     − reembolsos a socios pagados desde PayPal
--   PENDIENTE       = ventas de cada método cuyo día no cubre todavía ningún
--                     cobro de ese método
--
-- Cada cuenta cuenta desde la fecha de SU saldo inicial. Los gastos generados
-- por cobros y traspasos no restan: el neto ya los lleva descontados.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_tesoreria(p_fecha_corte date default current_date)
returns table (
  saldo_inicial_banco   numeric,
  fecha_inicial_banco   date,
  saldo_inicial_paypal  numeric,
  fecha_inicial_paypal  date,
  cobrado_shopify       numeric,
  cobrado_paypal        numeric,
  traspasos_salida      numeric,
  traspasos_entrada     numeric,
  gastos_banco          numeric,
  gastos_paypal         numeric,
  reembolsos_banco      numeric,
  reembolsos_paypal     numeric,
  saldo_banco           numeric,
  saldo_paypal          numeric,
  caja_total            numeric,
  ventas_shopify        numeric,
  ventas_paypal         numeric,
  pendiente_shopify     numeric,
  pendiente_paypal      numeric,
  pendiente_total       numeric
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
        where coalesce(m.cuenta_pago, 'banco') = 'banco'
          and m.fecha >= (select desde from b)), 0) as banco,
      coalesce(sum(m.total_eur) filter (
        where m.cuenta_pago = 'paypal'
          and m.fecha >= (select desde from pp)), 0) as paypal
    from public.movimientos m
    where m.tipo = 'gasto'
      and m.anticipado_por is null
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
  -- Ventas por día y método, y si un cobro de ese método (llegado como muy
  -- tarde en la fecha de corte) cubre ese día.
  ventas as (
    select
      m.metodo_cobro,
      m.fecha,
      sum(m.total_eur) as importe,
      exists (
        select 1 from public.cobros_pasarela c
        where c.metodo_cobro = m.metodo_cobro
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
    group by m.metodo_cobro, m.fecha
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

comment on function public.fn_tesoreria(date) is
  'Saldo en banco, saldo en PayPal, caja total (banco + PayPal) y pendiente de '
  'cobro por método, a una fecha de corte.';


-- ───────────────────────────────────────────────────────────────────────────
-- 9. LIQUIDACIÓN — la caja disponible es banco + PayPal
--
-- Mismo cuerpo que en 0015; solo cambia el bloque «Caja disponible».
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

  -- Caja disponible a la fecha de corte: banco + PayPal (0017). Ni las ventas
  -- que siguen en la pasarela ni los gastos que adelantó un socio están en
  -- ninguna de las dos cuentas.
  select t.caja_total into v_caja from public.fn_tesoreria(p_fecha_corte) t;
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
  'Foto de la liquidación a una fecha: resultado, pérdidas, anticipos, caja (banco + PayPal) y '
  'si se puede repartir (R3, R4, R5).';


-- El saldo de la 0015 solo veía el banco. Se retira para que nadie vuelva a
-- leer como caja total una cifra a la que le falta PayPal.
drop function if exists public.fn_saldo_banco(date);


-- ───────────────────────────────────────────────────────────────────────────
-- 10. PERMISOS
-- ───────────────────────────────────────────────────────────────────────────

revoke all on public.vw_cobros_conciliacion from anon;
revoke all on public.vw_ventas_cobertura    from anon;
grant select on public.vw_cobros_conciliacion to authenticated;
grant select on public.vw_ventas_cobertura    to authenticated;

-- Las funciones de disparador las llama la escritura de quien escribe: son
-- SECURITY INVOKER y la RLS sigue mandando.
revoke all on function public.normalizar_cuentas_movimiento()                                   from public, anon;
revoke all on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb, text) from public, anon;
revoke all on function public.fn_registrar_ventas_dia(date, text, numeric, numeric, int, numeric, int, boolean) from public, anon;
revoke all on function public.fn_cobro_sincronizar_gasto(uuid, numeric, text, text, date, uuid, text) from public, anon;
revoke all on function public.cobros_generar_gastos()                                           from public, anon;
revoke all on function public.traspasos_generar_gasto()                                         from public, anon;
revoke all on function public.proteger_gasto_de_cobro()                                         from public, anon;
revoke all on function public.fn_ventas_registradas(date, date, text)                           from public, anon;
revoke all on function public.fn_cobros_solapados(text, date, date, text)                       from public, anon;
revoke all on function public.fn_tesoreria(date)                                                from public, anon;
revoke all on function public.fn_estado_liquidacion(date)                                       from public, anon;

grant execute on function public.normalizar_cuentas_movimiento()                                   to authenticated;
grant execute on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb, text) to authenticated;
grant execute on function public.fn_registrar_ventas_dia(date, text, numeric, numeric, int, numeric, int, boolean) to authenticated;
grant execute on function public.fn_cobro_sincronizar_gasto(uuid, numeric, text, text, date, uuid, text) to authenticated;
grant execute on function public.cobros_generar_gastos()                                           to authenticated;
grant execute on function public.traspasos_generar_gasto()                                         to authenticated;
grant execute on function public.proteger_gasto_de_cobro()                                         to authenticated;
grant execute on function public.fn_ventas_registradas(date, date, text)                           to authenticated;
grant execute on function public.fn_cobros_solapados(text, date, date, text)                       to authenticated;
grant execute on function public.fn_tesoreria(date)                                                to authenticated;
grant execute on function public.fn_estado_liquidacion(date)                                       to authenticated;
