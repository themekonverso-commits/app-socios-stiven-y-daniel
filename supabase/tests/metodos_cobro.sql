-- ═══════════════════════════════════════════════════════════════════════════
-- Tests de los dos métodos de cobro: Shopify Payments y PayPal (migración 0017)
--
-- CÓMO EJECUTARLOS
--   Pega el archivo entero en el SQL Editor de Supabase y pulsa Run. Devuelve
--   una tabla con un PASA/FALLA por caso.
--
-- NO ESCRIBE NADA EN LA BASE DE DATOS.
--   Todo va dentro de un BEGIN … ROLLBACK. Las fechas son de 2031 para no
--   mezclarse con datos reales, y los saldos se miden POR DIFERENCIA contra la
--   foto de antes: la base real ya tiene movimientos.
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
  socio_a   uuid,
  socio_b   uuid,
  cat_ads   uuid,
  cat_venta uuid
) on commit drop;

insert into _ctx
select
  (array_agg(p.id order by p.nombre))[1],
  (array_agg(p.id order by p.nombre))[2],
  (select id from public.categorias where nombre = 'Publicidad' and tipo = 'gasto'),
  (select id from public.categorias where nombre = 'Ventas Shopify' and tipo = 'ingreso')
from public.profiles p
where p.activo = true;

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

-- Un gasto mínimo, firmado por quien esté suplantado.
create or replace function pg_temp.gasto(
  p_fecha date, p_importe numeric, p_autor uuid,
  p_anticipado uuid default null, p_cuenta text default null)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa, base_imponible, iva_tipo,
    iva_importe, total, tasa_cambio, total_eur, base_eur, anticipado_por,
    cuenta_pago, created_by)
  values (
    'gasto', p_fecha, 'TEST métodos', (select cat_ads from _ctx), 'EUR',
    p_importe, 0, 0, p_importe, 1, p_importe, p_importe, p_anticipado,
    p_cuenta, p_autor)
  returning id into v_id;
  return v_id;
end;
$$;

-- Un cobro mínimo.
create or replace function pg_temp.cobro(
  p_plataforma text, p_fecha date, p_desde date, p_hasta date,
  p_bruto numeric, p_comision numeric, p_ref text default null)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.cobros_pasarela (
    fecha_cobro, periodo_desde, periodo_hasta, plataforma,
    importe_bruto, comisiones, importe_neto, referencia)
  values (p_fecha, p_desde, p_hasta, p_plataforma,
    p_bruto, p_comision, p_bruto - p_comision, p_ref)
  returning id into v_id;
  return v_id;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 1 — Lo que ya había quedó asignado: ninguna venta sin método, ningún gasto
--     del negocio sin cuenta, ningún anticipo con cuenta
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_ventas_sin int;
  v_gastos_sin int;
  v_anticipos_con int;
begin
  select count(*) into v_ventas_sin
  from public.movimientos m join public.categorias c on c.id = m.categoria_id
  where m.tipo = 'ingreso' and c.nombre = 'Ventas Shopify' and m.metodo_cobro is null;

  select count(*) into v_gastos_sin
  from public.movimientos
  where tipo = 'gasto' and anticipado_por is null and cuenta_pago is null;

  select count(*) into v_anticipos_con
  from public.movimientos
  where anticipado_por is not null and cuenta_pago is not null;

  insert into _resultados values (
    1, 'Relleno: ventas sin método · gastos del negocio sin cuenta · anticipos con cuenta',
    '0 · 0 · 0',
    concat_ws(' · ', v_ventas_sin, v_gastos_sin, v_anticipos_con),
    v_ventas_sin = 0 and v_gastos_sin = 0 and v_anticipos_con = 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2 — /diario con los dos métodos: dos movimientos, cada uno con su método
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c   _ctx%rowtype;
  r   jsonb;
  v   text;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  r := public.fn_registrar_ventas_dia('2031-03-03', 'EUR', 1, 100, 2, 40, 1);
  perform pg_temp.volver();

  select string_agg(m.metodo_cobro || ' ' || m.total_eur || ' ' || m.num_pedidos, ' · '
                    order by m.metodo_cobro)
    into v
  from public.movimientos m
  where m.fecha = '2031-03-03' and m.categoria_id = c.cat_venta;

  insert into _resultados values (
    2, 'Día con Shopify 100 € (2 pedidos) y PayPal 40 € (1 pedido): un movimiento por método',
    'paypal 40.00 1 · shopify_payments 100.00 2',
    coalesce(v, '(nada)') || '  [' || r::text || ']',
    v = 'paypal 40.00 1 · shopify_payments 100.00 2');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3 — La facturación total, los pedidos y el ticket medio dan lo mismo que
--     con un solo campo: 140 € y 3 pedidos en un día, o 100 + 40 y 2 + 1
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c     _ctx%rowtype;
  a     record;
  b     record;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  -- Como antes del cambio: todo en un único importe.
  perform public.fn_registrar_ventas_dia('2031-03-10', 'EUR', 1, 140, 3, 0, 0);
  -- Con el desglose nuevo.
  perform public.fn_registrar_ventas_dia('2031-03-11', 'EUR', 1, 100, 2, 40, 1);
  perform pg_temp.volver();

  select * into a from public.fn_resumen_periodo('2031-03-10', '2031-03-10');
  select * into b from public.fn_resumen_periodo('2031-03-11', '2031-03-11');

  insert into _resultados values (
    3, 'KPI iguales con y sin desglose: ingresos · pedidos · ticket medio',
    '140.00 · 3 · 46.67 en los dos días',
    concat_ws(' · ', a.ingresos, a.pedidos, round(a.ingresos / a.pedidos, 2))
      || '  vs  ' ||
    concat_ws(' · ', b.ingresos, b.pedidos, round(b.ingresos / b.pedidos, 2)),
    a.ingresos = b.ingresos and a.pedidos = b.pedidos and a.ingresos = 140 and a.pedidos = 3);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4 — Volver a registrar el mismo día avisa y no toca nada; sobrescribir con
--     PayPal a cero borra el de PayPal y deja el de Shopify
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c        _ctx%rowtype;
  r        jsonb;
  v_antes  int;
  v_tras   int;
  v_final  text;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  perform public.fn_registrar_ventas_dia('2031-03-17', 'EUR', 1, 100, 2, 40, 1);
  select count(*) into v_antes from public.movimientos where fecha = '2031-03-17';
  r := public.fn_registrar_ventas_dia('2031-03-17', 'EUR', 1, 120, 3, 0, 0);
  select count(*) into v_tras from public.movimientos where fecha = '2031-03-17';
  perform public.fn_registrar_ventas_dia('2031-03-17', 'EUR', 1, 120, 3, 0, 0, true);
  perform pg_temp.volver();

  select string_agg(metodo_cobro || ' ' || total_eur, ' · ') into v_final
  from public.movimientos where fecha = '2031-03-17';

  insert into _resultados values (
    4, 'Mismo día otra vez: duplicado sin cambios; al sobrescribir, PayPal a 0 desaparece',
    'duplicado true · 2 → 2 filas · shopify_payments 120.00',
    concat_ws(' · ', 'duplicado ' || (r ->> 'duplicado'), v_antes || ' → ' || v_tras || ' filas', v_final),
    (r ->> 'duplicado')::boolean and v_antes = 2 and v_tras = 2
      and v_final = 'shopify_payments 120.00');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5 — Sustituir las ventas que registró el otro socio se rechaza con su
--     nombre, en vez de «guardar» sin hacer nada por culpa de la RLS
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c       _ctx%rowtype;
  v_error text;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  perform public.fn_registrar_ventas_dia('2031-03-18', 'EUR', 1, 50, 1, 0, 0);
  perform pg_temp.volver();

  perform pg_temp.suplantar(c.socio_b);
  begin
    perform public.fn_registrar_ventas_dia('2031-03-18', 'EUR', 1, 60, 1, 0, 0, true);
  exception when others then
    v_error := sqlerrm;
  end;
  perform pg_temp.volver();

  insert into _resultados values (
    5, 'El otro socio no puede sustituir las ventas ajenas: error con el nombre del autor',
    'error «… las registró <autor> …»', coalesce(v_error, 'SE COLÓ'),
    v_error like '%las registró%');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6 — TEST PEDIDO: cobro de PayPal y cobro de Shopify del MISMO periodo.
--     Ninguno avisa de duplicado y los dos cuadran.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c    _ctx%rowtype;
  v_s  uuid;
  v_p  uuid;
  s    record;
  p    record;
  v_n  int;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  perform public.fn_registrar_ventas_dia('2031-04-07', 'EUR', 1, 200, 4, 60, 2);
  v_s := pg_temp.cobro('Shopify Payments', '2031-04-16', '2031-04-07', '2031-04-07', 200, 5.80, 'T6-S');
  v_p := pg_temp.cobro('PayPal',           '2031-04-07', '2031-04-07', '2031-04-07',  60, 2.39, 'T6-P');
  select count(*) into v_n from public.fn_cobros_solapados('PayPal', '2031-04-07', '2031-04-07')
   where id <> v_p;
  perform pg_temp.volver();

  select * into s from public.vw_cobros_conciliacion where id = v_s;
  select * into p from public.vw_cobros_conciliacion where id = v_p;

  insert into _resultados values (
    6, 'Cobro Shopify y cobro PayPal del mismo periodo: sin avisos de duplicado y los dos cuadran',
    'Shopify 200=200 cuadra, 0 solapes · PayPal 60=60 cuadra, 0 solapes · solapes previos PayPal 0',
    format('Shopify %s=%s %s, %s solapes · PayPal %s=%s %s, %s solapes · solapes previos PayPal %s',
      s.importe_bruto, s.ventas_registradas, case when s.cuadra then 'cuadra' else 'NO CUADRA' end,
      jsonb_array_length(s.solapados),
      p.importe_bruto, p.ventas_registradas, case when p.cuadra then 'cuadra' else 'NO CUADRA' end,
      jsonb_array_length(p.solapados), v_n),
    s.cuadra and p.cuadra and jsonb_array_length(s.solapados) = 0
      and jsonb_array_length(p.solapados) = 0 and v_n = 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 7 — TEST PEDIDO: semana con días de los dos métodos. Cada cobro concilia
--     solo con su parte, nunca con el total del día.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c    _ctx%rowtype;
  v_s  uuid;
  v_p  uuid;
  s    record;
  p    record;
  v_cob text;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  -- Lunes a miércoles: Shopify 100 + 80 + 0 = 180 · PayPal 30 + 0 + 45 = 75
  perform public.fn_registrar_ventas_dia('2031-05-05', 'EUR', 1, 100, 2, 30, 1);
  perform public.fn_registrar_ventas_dia('2031-05-06', 'EUR', 1,  80, 1,  0, 0);
  perform public.fn_registrar_ventas_dia('2031-05-07', 'EUR', 1,   0, 0, 45, 1);
  -- Payout semanal de Shopify y un cobro de PayPal que cubre los tres días
  v_s := pg_temp.cobro('Shopify Payments', '2031-05-14', '2031-05-05', '2031-05-11', 180, 5.22);
  v_p := pg_temp.cobro('PayPal',           '2031-05-07', '2031-05-05', '2031-05-07',  75, 3.00);
  perform pg_temp.volver();

  select * into s from public.vw_cobros_conciliacion where id = v_s;
  select * into p from public.vw_cobros_conciliacion where id = v_p;

  select string_agg(to_char(fecha, 'DD') || ' ' || metodo_cobro || ' '
                    || case when cubierta then 'cubierta' else 'PENDIENTE' end, ' · '
                    order by fecha, metodo_cobro)
    into v_cob
  from public.vw_ventas_cobertura
  where fecha between '2031-05-05' and '2031-05-07';

  insert into _resultados values (
    7, 'Días mixtos: Shopify concilia 180 € (no 255) y PayPal 75 €; los cuatro tramos quedan cubiertos',
    'Shopify ventas 180.00 dif 0.00 · PayPal ventas 75.00 dif 0.00 · todo cubierto',
    format('Shopify ventas %s dif %s · PayPal ventas %s dif %s · %s',
      s.ventas_registradas, s.diferencia, p.ventas_registradas, p.diferencia, v_cob),
    s.ventas_registradas = 180 and s.cuadra and p.ventas_registradas = 75 and p.cuadra
      and v_cob not like '%PENDIENTE%');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 8 — Dos cobros de la MISMA plataforma con periodos cruzados sí avisan,
--     y la misma referencia también
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c    _ctx%rowtype;
  v_2  uuid;
  s    record;
  v_ref text;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.cobro('Shopify Payments', '2031-06-11', '2031-06-02', '2031-06-08', 10, 0, 'T8-A');
  v_2 := pg_temp.cobro('Shopify Payments', '2031-06-18', '2031-06-08', '2031-06-15', 10, 0, 'T8-B');
  select string_agg(motivo, ',') into v_ref
  from public.fn_cobros_solapados('Shopify Payments', '2031-07-01', '2031-07-02', 'T8-A');
  perform pg_temp.volver();

  select * into s from public.vw_cobros_conciliacion where id = v_2;

  insert into _resultados values (
    8, 'Dos payouts de Shopify con el domingo 08/06 en común: solapan; misma referencia: avisa',
    '1 solape · referencia',
    jsonb_array_length(s.solapados) || ' solape · ' || coalesce(v_ref, '(nada)'),
    jsonb_array_length(s.solapados) = 1 and v_ref = 'referencia');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 9 — Comisión de PayPal: gasto en «Comisiones pasarela de pago» con el
--     concepto «Comisiones PayPal — DD/MM»
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c   _ctx%rowtype;
  v_c uuid;
  g   record;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  v_c := pg_temp.cobro('PayPal', '2031-07-09', '2031-07-09', '2031-07-09', 50, 1.95);
  perform pg_temp.volver();

  select m.concepto, m.total_eur, m.cuenta_pago, cat.nombre as categoria into g
  from public.cobros_pasarela cp
  join public.movimientos m on m.id = cp.movimiento_comision_id
  join public.categorias cat on cat.id = m.categoria_id
  where cp.id = v_c;

  insert into _resultados values (
    9, 'Comisión de un cobro PayPal',
    'Comisiones PayPal — 09/07 · 1.95 · Comisiones pasarela de pago',
    concat_ws(' · ', g.concepto, g.total_eur, g.categoria),
    g.concepto = 'Comisiones PayPal — 09/07' and g.total_eur = 1.95
      and g.categoria = 'Comisiones pasarela de pago');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 10 — Un cobro de PayPal sube PayPal, no el banco; uno de Shopify, al revés
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c  _ctx%rowtype;
  a  record;
  b  record;
  d  record;
begin
  select * into c from _ctx;
  select * into a from public.fn_tesoreria('2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.cobro('PayPal', '2031-08-01', '2031-08-01', '2031-08-01', 100, 3.40);
  perform pg_temp.volver();
  select * into b from public.fn_tesoreria('2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.cobro('Shopify Payments', '2031-08-06', '2031-07-28', '2031-08-03', 200, 6.00);
  perform pg_temp.volver();
  select * into d from public.fn_tesoreria('2031-12-31');

  insert into _resultados values (
    10, 'Cobro PayPal neto 96,60 → PayPal; cobro Shopify neto 194 → banco (las comisiones no restan dos veces)',
    'PayPal +96.60 banco +0.00 · banco +194.00 PayPal +0.00',
    format('PayPal %s banco %s · banco %s PayPal %s',
      to_char(b.saldo_paypal - a.saldo_paypal, 'SG990D00'), to_char(b.saldo_banco - a.saldo_banco, 'SG990D00'),
      to_char(d.saldo_banco - b.saldo_banco, 'SG990D00'), to_char(d.saldo_paypal - b.saldo_paypal, 'SG990D00')),
    b.saldo_paypal - a.saldo_paypal = 96.60 and b.saldo_banco = a.saldo_banco
      and d.saldo_banco - b.saldo_banco = 194 and d.saldo_paypal = b.saldo_paypal);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 11 — TEST PEDIDO: traspaso PayPal → Banco. El total de caja no cambia.
--      Con comisión, baja exactamente la comisión, que queda como gasto.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c   _ctx%rowtype;
  a   record;
  b   record;
  d   record;
  r_a record;
  r_d record;
  g   record;
  v_t uuid;
begin
  select * into c from _ctx;
  select * into a from public.fn_tesoreria('2031-12-31');
  select * into r_a from public.fn_resumen_periodo('2031-01-01', '2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  insert into public.traspasos_paypal (fecha, importe, comision, importe_neto)
  values ('2031-09-01', 300, 0, 300);
  perform pg_temp.volver();
  select * into b from public.fn_tesoreria('2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  insert into public.traspasos_paypal (fecha, importe, comision, importe_neto)
  values ('2031-09-02', 100, 1.50, 98.50)
  returning id into v_t;
  perform pg_temp.volver();
  select * into d from public.fn_tesoreria('2031-12-31');
  select * into r_d from public.fn_resumen_periodo('2031-01-01', '2031-12-31');

  select m.concepto, m.total_eur into g
  from public.traspasos_paypal t join public.movimientos m on m.id = t.movimiento_comision_id
  where t.id = v_t;

  insert into _resultados values (
    11, 'Traspaso 300 € sin comisión: caja igual, banco +300, PayPal −300 · traspaso 100 € con 1,50 de comisión: caja −1,50 y gasto de 1,50',
    'caja +0.00 banco +300.00 PayPal -300.00 · caja -1.50 · gasto 1.50 «Comisión traspaso PayPal — 02/09» · ingresos +0.00',
    format('caja %s banco %s PayPal %s · caja %s · gasto %s «%s» · ingresos %s',
      to_char(b.caja_total - a.caja_total, 'SG990D00'),
      to_char(b.saldo_banco - a.saldo_banco, 'SG990D00'),
      to_char(b.saldo_paypal - a.saldo_paypal, 'SG990D00'),
      to_char(d.caja_total - b.caja_total, 'SG990D00'),
      r_d.gastos - r_a.gastos, g.concepto,
      to_char(r_d.ingresos - r_a.ingresos, 'SG990D00')),
    b.caja_total = a.caja_total
      and b.saldo_banco - a.saldo_banco = 300 and b.saldo_paypal - a.saldo_paypal = -300
      and d.caja_total - b.caja_total = -1.50
      and r_d.gastos - r_a.gastos = 1.50 and r_d.ingresos = r_a.ingresos
      and g.concepto = 'Comisión traspaso PayPal — 02/09');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 12 — Gastos y reembolsos: cada uno resta de la cuenta elegida; lo que
--      adelanta un socio no resta de ninguna
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c   _ctx%rowtype;
  a   record;
  b   record;
  v_ant uuid;
  v_cuenta text;
begin
  select * into c from _ctx;
  select * into a from public.fn_tesoreria('2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.gasto('2031-10-01', 20, c.socio_a, null, 'paypal');   -- PayPal −20
  perform pg_temp.gasto('2031-10-01', 30, c.socio_a, null, null);       -- banco −30 (por defecto)
  v_ant := pg_temp.gasto('2031-10-01', 80, c.socio_a, c.socio_b, 'paypal'); -- anticipo: ninguna
  perform public.fn_registrar_reembolso(
    c.socio_b, '2031-10-05', 80, 'transferencia', null,
    jsonb_build_array(jsonb_build_object('movimiento_id', v_ant, 'importe_eur', 80)),
    'paypal');                                                          -- PayPal −80
  perform pg_temp.volver();
  select * into b from public.fn_tesoreria('2031-12-31');

  select coalesce(cuenta_pago, 'ninguna') into v_cuenta from public.movimientos where id = v_ant;

  insert into _resultados values (
    12, 'Gasto PayPal 20 · gasto banco 30 · anticipo de socio 80 (sin cuenta) · reembolso 80 desde PayPal',
    'banco -30.00 · PayPal -100.00 · anticipo ninguna',
    format('banco %s · PayPal %s · anticipo %s',
      to_char(b.saldo_banco - a.saldo_banco, 'SG990D00'),
      to_char(b.saldo_paypal - a.saldo_paypal, 'SG990D00'), v_cuenta),
    b.saldo_banco - a.saldo_banco = -30 and b.saldo_paypal - a.saldo_paypal = -100
      and v_cuenta = 'ninguna');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 13 — Pendiente de cobro por método: sube al registrar la venta y baja
--      cuando un cobro de SU método cubre el día (uno del otro método, no)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c  _ctx%rowtype;
  a  record;
  b  record;
  d  record;
  e  record;
begin
  select * into c from _ctx;
  select * into a from public.fn_tesoreria('2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  perform public.fn_registrar_ventas_dia('2031-11-03', 'EUR', 1, 70, 1, 25, 1);
  perform pg_temp.volver();
  select * into b from public.fn_tesoreria('2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.cobro('Shopify Payments', '2031-11-12', '2031-11-03', '2031-11-09', 70, 2);
  perform pg_temp.volver();
  select * into d from public.fn_tesoreria('2031-12-31');

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.cobro('PayPal', '2031-11-03', '2031-11-03', '2031-11-03', 25, 1);
  perform pg_temp.volver();
  select * into e from public.fn_tesoreria('2031-12-31');

  insert into _resultados values (
    13, 'Pendiente: venta Shopify 70 + PayPal 25 → cobro Shopify → cobro PayPal',
    'S +70 P +25 · S -70 P 0 · S 0 P -25',
    format('S %s P %s · S %s P %s · S %s P %s',
      b.pendiente_shopify - a.pendiente_shopify, b.pendiente_paypal - a.pendiente_paypal,
      d.pendiente_shopify - b.pendiente_shopify, d.pendiente_paypal - b.pendiente_paypal,
      e.pendiente_shopify - d.pendiente_shopify, e.pendiente_paypal - d.pendiente_paypal),
    b.pendiente_shopify - a.pendiente_shopify = 70 and b.pendiente_paypal - a.pendiente_paypal = 25
      and d.pendiente_shopify - b.pendiente_shopify = -70 and d.pendiente_paypal = b.pendiente_paypal
      and e.pendiente_shopify = d.pendiente_shopify and e.pendiente_paypal - d.pendiente_paypal = -25
      and e.pendiente_total = e.pendiente_shopify + e.pendiente_paypal);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 14 — La liquidación toma como caja banco + PayPal
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_caja numeric;
  t      record;
begin
  select (public.fn_estado_liquidacion('2031-12-31') ->> 'caja_disponible')::numeric into v_caja;
  select * into t from public.fn_tesoreria('2031-12-31');

  insert into _resultados values (
    14, 'fn_estado_liquidacion: caja_disponible = saldo banco + saldo PayPal',
    t.saldo_banco || ' + ' || t.saldo_paypal || ' = ' || t.caja_total,
    v_caja::text, v_caja = t.saldo_banco + t.saldo_paypal);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 15 — La plataforma de un cobro solo puede ser Shopify Payments o PayPal
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c       _ctx%rowtype;
  v_error text;
begin
  select * into c from _ctx;
  perform pg_temp.suplantar(c.socio_a);
  begin
    perform pg_temp.cobro('Stripe', '2031-12-01', '2031-12-01', '2031-12-01', 10, 0);
  exception when check_violation then
    v_error := 'check_violation';
  end;
  perform pg_temp.volver();

  insert into _resultados values (
    15, 'Plataforma «Stripe»: la rechaza el CHECK',
    'check_violation', coalesce(v_error, 'SE COLÓ'), v_error is not null);
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
