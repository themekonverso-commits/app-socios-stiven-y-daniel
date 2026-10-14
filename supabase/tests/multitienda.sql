-- ═══════════════════════════════════════════════════════════════════════════
-- Tests de la multi-tienda y el medio de pago (migraciones 0018 y 0019)
--
-- CÓMO EJECUTARLOS
--   Pega el archivo entero en el SQL Editor de Supabase y pulsa Run, o:
--     npx supabase db query --linked -f supabase/tests/multitienda.sql
--   Devuelve una tabla con un PASA/FALLA por caso.
--
-- NO ESCRIBE NADA EN LA BASE DE DATOS.
--   Todo va dentro de un BEGIN … ROLLBACK, con dos tiendas de pruebas creadas
--   aquí mismo y fechas de 2032. Lo global (caja, cupo, anticipos) se mide POR
--   DIFERENCIA contra la foto de antes: la base real ya tiene movimientos.
--
-- Las escrituras se hacen en la piel de un socio (`set local role
-- authenticated` + `request.jwt.claims`), igual que desde la aplicación.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _resultados (
  n        int,
  caso     text,
  esperado text,
  obtenido text,
  ok       boolean
) on commit drop;

create temporary table _ctx (
  socio_a     uuid,   -- el socio de la tarjeta
  socio_b     uuid,   -- el otro
  cat_ads     uuid,
  cat_ia      uuid,
  cat_venta   uuid,
  tienda_a    uuid,
  tienda_b    uuid,
  tienda_vacia uuid
) on commit drop;

insert into _ctx (socio_a, socio_b, cat_ads, cat_ia, cat_venta)
select
  public.fn_socio_tarjeta(),
  (select id from public.profiles where activo and id <> public.fn_socio_tarjeta() order by nombre limit 1),
  (select id from public.categorias where nombre = 'Publicidad' and tipo = 'gasto'),
  (select id from public.categorias where nombre = 'Herramientas de IA y software' and tipo = 'gasto'),
  (select id from public.categorias where nombre = 'Ventas Shopify' and tipo = 'ingreso');

grant all on _resultados, _ctx to authenticated;

create or replace function pg_temp.suplantar(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.volver()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- Un movimiento mínimo, firmado por quien esté suplantado.
create or replace function pg_temp.mov(
  p_tipo text, p_fecha date, p_importe numeric, p_tienda uuid,
  p_medio text default null, p_anticipado uuid default null, p_categoria uuid default null)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa, base_imponible, iva_tipo,
    iva_importe, total, tasa_cambio, total_eur, base_eur, anticipado_por,
    medio_pago, tienda_id, created_by)
  values (
    p_tipo, p_fecha, 'TEST multitienda',
    coalesce(p_categoria, case when p_tipo = 'ingreso'
                               then (select cat_venta from _ctx) else (select cat_ads from _ctx) end),
    'EUR', p_importe, 0, 0, p_importe, 1, p_importe, p_importe,
    p_anticipado, p_medio, p_tienda, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Dos tiendas de pruebas y una vacía, creadas por el socio A.
do $$
declare c _ctx%rowtype;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  insert into public.tiendas (nombre, slug, color, fecha_lanzamiento)
  values ('TEST Tienda A', 'test-tienda-a', '#112233', '2032-01-01');
  insert into public.tiendas (nombre, slug, color, fecha_lanzamiento)
  values ('TEST Tienda B', 'test-tienda-b', '#445566', '2032-01-01');
  insert into public.tiendas (nombre, slug, color, fecha_lanzamiento)
  values ('TEST Tienda vacía', 'test-tienda-vacia', '#778899', '2032-01-01');
  perform pg_temp.volver();

  update _ctx set
    tienda_a     = (select id from public.tiendas where slug = 'test-tienda-a'),
    tienda_b     = (select id from public.tiendas where slug = 'test-tienda-b'),
    tienda_vacia = (select id from public.tiendas where slug = 'test-tienda-vacia');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 1 — Lo existente quedó migrado: ningún ingreso sin tienda, ningún gasto sin
--     medio de pago, y ningún gasto existente pasó solo a la tarjeta… salvo
--     los que hayan marcado los socios después.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_ing int; v_gas int; v_incoh int;
begin
  select count(*) into v_ing from public.movimientos where tipo = 'ingreso' and tienda_id is null;
  select count(*) into v_gas from public.movimientos where tipo = 'gasto' and medio_pago is null;
  -- Coherencia del medio con el anticipo (lo garantiza el CHECK; se comprueba igual).
  select count(*) into v_incoh from public.movimientos
  where tipo = 'gasto'
    and (medio_pago in ('tarjeta_daniel', 'bolsillo')) <> (anticipado_por is not null);

  insert into _resultados values (
    1, 'Migración: ingresos sin tienda · gastos sin medio · medio incoherente con el anticipo',
    '0 · 0 · 0', concat_ws(' · ', v_ing, v_gas, v_incoh),
    v_ing = 0 and v_gas = 0 and v_incoh = 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2 — Un gasto de la tienda B no aparece en el dashboard de la tienda A
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  a record; b record;
  v_mes_a int; v_cat_a int;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_b);
  perform pg_temp.mov('gasto', '2032-01-10', 100, c.tienda_b, 'banco');
  perform pg_temp.volver();

  select * into a from public.fn_resumen_periodo('2032-01-01', '2032-01-31', c.tienda_a, false);
  select * into b from public.fn_resumen_periodo('2032-01-01', '2032-01-31', c.tienda_b, false);
  select count(*) into v_mes_a from public.fn_resumen_mensual(c.tienda_a, false) where mes = '2032-01-01';
  select count(*) into v_cat_a from public.fn_gastos_categoria(c.tienda_a, false) where mes = '2032-01-01';

  insert into _resultados values (
    2, 'Gasto de 100 € en B: gastos de A · gastos de B · filas de A en mensual y categorías',
    '0 · 100 · 0 · 0',
    concat_ws(' · ', a.gastos, b.gastos, v_mes_a, v_cat_a),
    a.gastos = 0 and b.gastos = 100 and v_mes_a = 0 and v_cat_a = 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3 — La vista «Todas» es la suma de las tiendas más General
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  t record; g record; s record; cmp record;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.mov('ingreso', '2032-02-05', 300, c.tienda_a);
  perform pg_temp.mov('gasto',   '2032-02-06',  50, c.tienda_a, 'banco');
  perform pg_temp.mov('gasto',   '2032-02-07', 100, c.tienda_b, 'paypal');
  perform pg_temp.mov('gasto',   '2032-02-08',  20, null, 'banco', null, c.cat_ia);
  perform pg_temp.volver();

  select * into t from public.fn_resumen_periodo('2032-02-01', '2032-02-29', null, false);
  select * into g from public.fn_resumen_periodo('2032-02-01', '2032-02-29', null, true);
  -- Suma de todas las tiendas, una a una.
  select
    sum(r.ingresos) as ingresos, sum(r.gastos) as gastos, sum(r.beneficio) as beneficio
    into s
  from public.tiendas ti
  cross join lateral public.fn_resumen_periodo('2032-02-01', '2032-02-29', ti.id, false) r;
  -- Y la tabla comparativa del dashboard, que trae la fila de General.
  select sum(x.ingresos) as ingresos, sum(x.gastos) as gastos, sum(x.beneficio) as beneficio
    into cmp
  from public.fn_comparativa_tiendas('2032-02-01', '2032-02-29') x;

  insert into _resultados values (
    3, 'Febrero 2032 — Todas (ing/gas/benef) = tiendas + General = comparativa',
    '300/170/130 · 300/170/130 · 300/170/130 · General 20',
    concat_ws(' · ',
      concat_ws('/', t.ingresos, t.gastos, t.beneficio),
      concat_ws('/', s.ingresos + g.ingresos, s.gastos + g.gastos, s.beneficio + g.beneficio),
      concat_ws('/', cmp.ingresos, cmp.gastos, cmp.beneficio),
      'General ' || g.gastos),
    t.ingresos = 300 and t.gastos = 170 and t.beneficio = 130
    and s.ingresos + g.ingresos = t.ingresos and s.gastos + g.gastos = t.gastos
    and s.beneficio + g.beneficio = t.beneficio
    and cmp.ingresos = t.ingresos and cmp.gastos = t.gastos and cmp.beneficio = t.beneficio
    and g.gastos = 20 and g.ingresos = 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4 — Un gasto con tarjeta en la tienda B sube el cupo, y el cupo es el mismo
--     se mire desde donde se mire (no depende de la tienda)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_antes jsonb; v_desde_a jsonb; v_desde_otro jsonb;
  v_b numeric;
begin
  select * into c from _ctx;
  v_antes := public.fn_cupo_tarjeta();

  -- Lo registra el socio que NO es el de la tarjeta, en la tienda B…
  perform pg_temp.suplantar(c.socio_b);
  perform pg_temp.mov('gasto', '2032-03-03', 250, c.tienda_b, 'tarjeta_daniel');
  v_desde_otro := public.fn_cupo_tarjeta();
  perform pg_temp.volver();

  -- …y lo mira el de la tarjeta, «desde» la tienda A.
  perform pg_temp.suplantar(c.socio_a);
  v_desde_a := public.fn_cupo_tarjeta();
  perform pg_temp.volver();

  select (e ->> 'consumido')::numeric into v_b
  from jsonb_array_elements(v_desde_a -> 'por_tienda') e
  where (e ->> 'tienda_id')::uuid = c.tienda_b;

  insert into _resultados values (
    4, 'Tarjeta 250 € en B: sube el cupo · igual para los dos socios · desglose de B',
    '+250 · iguales · 250',
    concat_ws(' · ',
      '+' || ((v_desde_a ->> 'consumido')::numeric - (v_antes ->> 'consumido')::numeric),
      case when v_desde_a = v_desde_otro then 'iguales' else 'DISTINTOS' end,
      coalesce(v_b::text, 'sin fila')),
    (v_desde_a ->> 'consumido')::numeric - (v_antes ->> 'consumido')::numeric = 250
    and v_desde_a = v_desde_otro
    and v_b = 250
    and (v_desde_a ->> 'disponible')::numeric
        = (v_desde_a ->> 'limite')::numeric - (v_desde_a ->> 'consumido')::numeric);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5 — 'tarjeta_daniel' fuerza anticipado_por = socio de la tarjeta, aunque
--     se mande otro socio o ninguno, también al editar
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v1 uuid; v2 uuid; v3 uuid;
  r1 uuid; r2 uuid; r3 uuid;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_b);
  v1 := pg_temp.mov('gasto', '2032-03-10', 10, c.tienda_a, 'tarjeta_daniel', c.socio_b);
  v2 := pg_temp.mov('gasto', '2032-03-10', 10, c.tienda_a, 'tarjeta_daniel', null);
  v3 := pg_temp.mov('gasto', '2032-03-10', 10, c.tienda_a, 'banco');
  update public.movimientos set medio_pago = 'tarjeta_daniel' where id = v3;
  update public.movimientos set anticipado_por = c.socio_b where id = v1;
  perform pg_temp.volver();

  select anticipado_por into r1 from public.movimientos where id = v1;
  select anticipado_por into r2 from public.movimientos where id = v2;
  select anticipado_por into r3 from public.movimientos where id = v3;

  insert into _resultados values (
    5, 'Tarjeta con otro socio · sin socio · banco→tarjeta: todos quedan del socio de la tarjeta',
    'sí · sí · sí',
    concat_ws(' · ',
      case when r1 = c.socio_a then 'sí' else 'NO' end,
      case when r2 = c.socio_a then 'sí' else 'NO' end,
      case when r3 = c.socio_a then 'sí' else 'NO' end),
    r1 = c.socio_a and r2 = c.socio_a and r3 = c.socio_a);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6 — Un gasto 'banco' no genera anticipo y resta del saldo del banco; uno
--     'paypal', del de PayPal. Ninguno toca el pendiente de los socios.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  t0 record; t1 record;
  v_pend0 numeric; v_pend1 numeric;
  v_ant uuid; v_id uuid;
begin
  select * into c from _ctx;
  select * into t0 from public.fn_tesoreria('2032-12-31');
  select sum(pendiente) into v_pend0 from public.vw_anticipos_socio;

  perform pg_temp.suplantar(c.socio_a);
  v_id := pg_temp.mov('gasto', '2032-04-01', 75.50, c.tienda_b, 'banco', c.socio_a);
  perform pg_temp.mov('gasto', '2032-04-02', 12.25, c.tienda_a, 'paypal');
  perform pg_temp.volver();

  select * into t1 from public.fn_tesoreria('2032-12-31');
  select sum(pendiente) into v_pend1 from public.vw_anticipos_socio;
  select anticipado_por into v_ant from public.movimientos where id = v_id;

  insert into _resultados values (
    6, 'Banco 75,50 (con socio mandado) · PayPal 12,25: Δ banco · Δ PayPal · Δ pendiente · anticipo',
    '-75.50 · -12.25 · 0 · ninguno',
    concat_ws(' · ', t1.saldo_banco - t0.saldo_banco, t1.saldo_paypal - t0.saldo_paypal,
              v_pend1 - v_pend0, coalesce(v_ant::text, 'ninguno')),
    t1.saldo_banco - t0.saldo_banco = -75.50
    and t1.saldo_paypal - t0.saldo_paypal = -12.25
    and v_pend1 = v_pend0 and v_ant is null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 7 — Un anticipo hecho en la tienda B se reembolsa (con caja de la sociedad)
--     y aparece en la liquidación global
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_id uuid;
  v_liq0 jsonb; v_liq1 jsonb; v_liq2 jsonb;
  v_pend_b0 numeric; v_pend_b1 numeric; v_pend_b2 numeric;
  v_tienda_pend uuid;
begin
  select * into c from _ctx;
  v_liq0 := public.fn_estado_liquidacion('2032-12-31');
  v_pend_b0 := (v_liq0 -> 'anticipos' -> c.socio_b::text ->> 'pendiente')::numeric;

  perform pg_temp.suplantar(c.socio_b);
  v_id := pg_temp.mov('gasto', '2032-05-05', 40, c.tienda_b, 'bolsillo', c.socio_b);
  perform pg_temp.volver();

  v_liq1 := public.fn_estado_liquidacion('2032-12-31');
  v_pend_b1 := (v_liq1 -> 'anticipos' -> c.socio_b::text ->> 'pendiente')::numeric;
  select tienda_id into v_tienda_pend from public.vw_anticipos_pendientes where id = v_id;

  perform pg_temp.suplantar(c.socio_a);
  perform public.fn_registrar_reembolso(
    c.socio_b, '2032-05-20', 40, 'Transferencia', 'TEST',
    jsonb_build_array(jsonb_build_object('movimiento_id', v_id, 'importe_eur', 40)), 'banco');
  perform pg_temp.volver();

  v_liq2 := public.fn_estado_liquidacion('2032-12-31');
  v_pend_b2 := (v_liq2 -> 'anticipos' -> c.socio_b::text ->> 'pendiente')::numeric;

  insert into _resultados values (
    7, 'Anticipo 40 € en B: Δ pendiente al anotarlo · tienda en la lista · Δ tras reembolsar',
    '+40 · B · 0',
    concat_ws(' · ', '+' || (v_pend_b1 - v_pend_b0),
      case when v_tienda_pend = c.tienda_b then 'B' else coalesce(v_tienda_pend::text, 'sin tienda') end,
      v_pend_b2 - v_pend_b0),
    v_pend_b1 - v_pend_b0 = 40 and v_tienda_pend = c.tienda_b and v_pend_b2 = v_pend_b0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 8 — No se puede borrar una tienda con datos; una vacía, sí
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_error text;
  v_vacia_sigue boolean;
  v_b_sigue boolean;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  begin
    delete from public.tiendas where id = c.tienda_b;
  exception when foreign_key_violation then
    v_error := 'foreign_key_violation';
  end;
  delete from public.tiendas where id = c.tienda_vacia;
  perform pg_temp.volver();

  select exists (select 1 from public.tiendas where id = c.tienda_vacia) into v_vacia_sigue;
  select exists (select 1 from public.tiendas where id = c.tienda_b) into v_b_sigue;

  insert into _resultados values (
    8, 'Borrar tienda B (con datos) · borrar tienda vacía',
    'foreign_key_violation · borrada',
    concat_ws(' · ', coalesce(v_error, 'SE BORRÓ'),
      case when v_vacia_sigue then 'NO se borró' else 'borrada' end),
    v_error is not null and v_b_sigue and not v_vacia_sigue);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 9 — Bolsillo sin socio y ingreso sin tienda: los rechaza la base de datos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_e1 text; v_e2 text;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  begin
    perform pg_temp.mov('gasto', '2032-06-01', 10, c.tienda_a, 'bolsillo', null);
  exception when raise_exception then
    v_e1 := 'rechazado';
  end;
  begin
    perform pg_temp.mov('ingreso', '2032-06-01', 10, null);
  exception when check_violation then
    v_e2 := 'rechazado';
  end;
  perform pg_temp.volver();

  insert into _resultados values (
    9, 'Gasto de bolsillo sin socio · ingreso sin tienda',
    'rechazado · rechazado',
    concat_ws(' · ', coalesce(v_e1, 'SE COLÓ'), coalesce(v_e2, 'SE COLÓ')),
    v_e1 is not null and v_e2 is not null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 10 — Un cobro de la tienda A no concilia con ventas de la tienda B, y sus
--      comisiones van a la tienda A
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_cobro uuid;
  v_ventas numeric; v_reg numeric;
  v_tienda_com uuid;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  perform public.fn_registrar_ventas_dia(c.tienda_b, '2032-07-06', 'EUR', 1, 200, 4, 0, 0, false);
  perform public.fn_registrar_ventas_dia(c.tienda_a, '2032-07-07', 'EUR', 1, 120, 2, 0, 0, false);
  insert into public.cobros_pasarela (
    tienda_id, fecha_cobro, periodo_desde, periodo_hasta, plataforma,
    importe_bruto, comisiones, importe_neto)
  values (c.tienda_a, '2032-07-15', '2032-07-06', '2032-07-07', 'Shopify Payments',
    120, 3, 117)
  returning id into v_cobro;
  perform pg_temp.volver();

  select ventas_registradas into v_ventas from public.vw_cobros_conciliacion where id = v_cobro;
  v_reg := public.fn_ventas_registradas(c.tienda_a, '2032-07-06', '2032-07-07', 'shopify_payments');
  select m.tienda_id into v_tienda_com
  from public.cobros_pasarela cp join public.movimientos m on m.id = cp.movimiento_comision_id
  where cp.id = v_cobro;

  insert into _resultados values (
    10, 'Cobro de A sobre días con ventas de A (120) y B (200): ventas conciliadas · registradas · tienda de la comisión',
    '120 · 120 · A',
    concat_ws(' · ', v_ventas, v_reg,
      case when v_tienda_com = c.tienda_a then 'A' else coalesce(v_tienda_com::text, 'General') end),
    v_ventas = 120 and v_reg = 120 and v_tienda_com = c.tienda_a);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 11 — El registro diario es por tienda: el mismo día en otra tienda no es
--      un duplicado
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  r1 jsonb; r2 jsonb;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  r1 := public.fn_registrar_ventas_dia(c.tienda_a, '2032-08-01', 'EUR', 1, 50, 1, 0, 0, false);
  r2 := public.fn_registrar_ventas_dia(c.tienda_b, '2032-08-01', 'EUR', 1, 70, 1, 0, 0, false);
  perform pg_temp.volver();

  insert into _resultados values (
    11, 'Mismo día en A y en B: ninguno es duplicado',
    'false · false',
    concat_ws(' · ', r1 ->> 'duplicado', r2 ->> 'duplicado'),
    (r1 ->> 'duplicado')::boolean = false and (r2 ->> 'duplicado')::boolean = false);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 12 — Un anticipo ya reembolsado no puede cambiar de socio ni pasar a banco
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_id uuid;
  v_error text;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_b);
  v_id := pg_temp.mov('gasto', '2032-09-01', 30, c.tienda_a, 'bolsillo', c.socio_b);
  perform public.fn_registrar_reembolso(
    c.socio_b, '2032-09-02', 10, null, 'TEST',
    jsonb_build_array(jsonb_build_object('movimiento_id', v_id, 'importe_eur', 10)), 'banco');
  begin
    update public.movimientos set medio_pago = 'banco' where id = v_id;
  exception when raise_exception then
    v_error := 'rechazado';
  end;
  perform pg_temp.volver();

  insert into _resultados values (
    12, 'Anticipo con reembolso parcial: pasarlo a banco',
    'rechazado', coalesce(v_error, 'SE COLÓ'), v_error is not null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 13 — Seguridad de la tabla tiendas: sin sesión no se ve nada; editar
--      cualquier socio; crear firmando como otro, no
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_anon int;
  v_editada boolean;
  v_error text;
begin
  select * into c from _ctx;

  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  begin
    select count(*) into v_anon from public.tiendas;
  exception when insufficient_privilege then
    v_anon := 0;
  end;
  execute 'reset role';

  perform pg_temp.suplantar(c.socio_b);
  update public.tiendas set notas = 'editada por B' where id = c.tienda_a;
  begin
    insert into public.tiendas (nombre, slug, created_by)
    values ('TEST suplantada', 'test-suplantada', c.socio_a);
  exception when insufficient_privilege then
    v_error := 'rechazado';
  end;
  perform pg_temp.volver();

  select notas = 'editada por B' into v_editada from public.tiendas where id = c.tienda_a;

  insert into _resultados values (
    13, 'Tiendas: filas visibles sin sesión · el otro socio puede editar · crear firmando como otro',
    '0 · sí · rechazado',
    concat_ws(' · ', v_anon, case when v_editada then 'sí' else 'NO' end, coalesce(v_error, 'SE COLÓ')),
    v_anon = 0 and v_editada and v_error is not null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 14 — Una tienda archivada no admite movimientos nuevos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c _ctx%rowtype;
  v_error text;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  update public.tiendas set estado = 'archivada' where id = c.tienda_a;
  begin
    perform pg_temp.mov('gasto', '2032-10-01', 5, c.tienda_a, 'banco');
  exception when raise_exception then
    v_error := 'rechazado';
  end;
  update public.tiendas set estado = 'activa' where id = c.tienda_a;
  perform pg_temp.volver();

  insert into _resultados values (
    14, 'Gasto nuevo en una tienda archivada',
    'rechazado', coalesce(v_error, 'SE COLÓ'), v_error is not null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- RESULTADOS
-- ───────────────────────────────────────────────────────────────────────────

select
  n,
  case when ok then 'PASA' else 'FALLA' end as resultado,
  caso,
  esperado,
  obtenido
from _resultados
order by n;

rollback;
