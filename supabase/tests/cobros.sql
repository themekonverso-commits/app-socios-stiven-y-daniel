-- ═══════════════════════════════════════════════════════════════════════════
-- Tests de cobros de la pasarela y saldo en banco (migración 0015)
--
-- CÓMO EJECUTARLOS
--   Pega el archivo entero en el SQL Editor de Supabase y pulsa Run. Devuelve
--   una tabla con un PASA/FALLA por caso.
--
-- NO ESCRIBE NADA EN LA BASE DE DATOS.
--   Todo va dentro de un BEGIN … ROLLBACK. Las fechas son de 2030 para no
--   mezclarse con datos reales, y las cifras del saldo se miden POR
--   DIFERENCIA contra la foto de antes: la base real ya tiene movimientos.
--
-- Las escrituras se hacen en la piel de un socio (`set local role
-- authenticated` + `request.jwt.claims`), igual que desde la aplicación: así
-- la RLS y la firma de autoría están activas, como en producción.
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
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.volver()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- Un movimiento mínimo, firmado por quien esté suplantado.
create or replace function pg_temp.mov(
  p_tipo text, p_fecha date, p_categoria uuid, p_importe numeric,
  p_autor uuid, p_anticipado uuid default null
)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa, base_imponible, iva_tipo,
    iva_importe, total, tasa_cambio, total_eur, base_eur, anticipado_por,
    created_by)
  values (
    p_tipo, p_fecha, 'TEST cobros', p_categoria, 'EUR', p_importe, 0,
    0, p_importe, 1, p_importe, p_importe, p_anticipado, p_autor)
  returning id into v_id;
  return v_id;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 1 — Un cobro que cuadra genera SOLO el gasto de comisión, sin ingreso
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c          _ctx%rowtype;
  v_ingresos int;
  v_ingresos2 int;
  v_cobro    record;
  v_gasto    record;
begin
  select * into c from _ctx;
  select count(*) into v_ingresos from public.movimientos where tipo = 'ingreso';

  perform pg_temp.suplantar(c.socio_a);
  insert into public.cobros_pasarela (
    fecha_cobro, periodo_desde, periodo_hasta,
    importe_bruto, comisiones, importe_neto, referencia)
  values ('2030-03-05', '2030-03-01', '2030-03-03', 320.00, 9.60, 310.40, 'TEST-1')
  returning * into v_cobro;
  perform pg_temp.volver();

  select m.total_eur, m.tipo, m.anticipado_por, m.concepto, cat.nombre as categoria, m.fecha
    into v_gasto
  from public.movimientos m join public.categorias cat on cat.id = m.categoria_id
  where m.id = v_cobro.movimiento_comision_id;

  select count(*) into v_ingresos2 from public.movimientos where tipo = 'ingreso';

  insert into _resultados values (
    1, 'Cobro que cuadra: un gasto de comisión de 9,60 €, sin anticipado, y ningún ingreso',
    'gasto 9.60 · Comisiones pasarela de pago · sin anticipo · 05/03 · +0 ingresos · sin devolución',
    concat_ws(' · ', v_gasto.tipo || ' ' || v_gasto.total_eur, v_gasto.categoria,
      case when v_gasto.anticipado_por is null then 'sin anticipo' else 'CON ANTICIPO' end,
      to_char(v_gasto.fecha, 'DD/MM'), '+' || (v_ingresos2 - v_ingresos) || ' ingresos',
      case when v_cobro.movimiento_devolucion_id is null then 'sin devolución' else 'CON DEVOLUCIÓN' end),
    v_gasto.tipo = 'gasto' and v_gasto.total_eur = 9.60
      and v_gasto.categoria = 'Comisiones pasarela de pago'
      and v_gasto.anticipado_por is null and v_gasto.fecha = '2030-03-05'
      and v_gasto.concepto = 'Comisiones Shopify — pago del 05/03'
      and v_ingresos2 = v_ingresos and v_cobro.movimiento_devolucion_id is null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2 — Un neto que no cuadra lo rechaza la base de datos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c       _ctx%rowtype;
  v_error text;
begin
  select * into c from _ctx;
  begin
    perform pg_temp.suplantar(c.socio_a);
    insert into public.cobros_pasarela (
      fecha_cobro, periodo_desde, periodo_hasta,
      importe_bruto, comisiones, importe_neto)
    values ('2030-03-06', '2030-03-01', '2030-03-03', 320.00, 9.60, 312.00);
  exception when check_violation then
    v_error := sqlerrm;
  end;
  perform pg_temp.volver();

  insert into _resultados values (
    2, 'Neto que no cuadra (320 − 9,60 ≠ 312): lo rechaza el CHECK',
    'check_violation', coalesce(v_error, 'SE COLÓ'),
    v_error like '%cobros_neto_cuadra%');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3 — Cobro con devoluciones y ajustes: dos gastos, el neto cuadra
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c        _ctx%rowtype;
  v_cobro  record;
  v_com    numeric;
  v_dev    numeric;
  v_catdev text;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  insert into public.cobros_pasarela (
    fecha_cobro, periodo_desde, periodo_hasta,
    importe_bruto, comisiones, devoluciones, otros_ajustes, importe_neto, referencia)
  values ('2030-04-10', '2030-04-01', '2030-04-07', 500.00, 15.00, 40.00, 2.50, 447.50, 'TEST-3')
  returning * into v_cobro;
  perform pg_temp.volver();

  select total_eur into v_com from public.movimientos where id = v_cobro.movimiento_comision_id;
  select m.total_eur, cat.nombre into v_dev, v_catdev
  from public.movimientos m join public.categorias cat on cat.id = m.categoria_id
  where m.id = v_cobro.movimiento_devolucion_id;

  insert into _resultados values (
    3, 'Cobro con devoluciones (500 − 15 − 40 + 2,50 = 447,50): comisión y devolución',
    'comisión 15.00 · devolución 40.00 en Devoluciones y reembolsos',
    'comisión ' || coalesce(v_com::text, '—') || ' · devolución ' ||
      coalesce(v_dev::text, '—') || ' en ' || coalesce(v_catdev, '—'),
    v_com = 15.00 and v_dev = 40.00 and v_catdev = 'Devoluciones y reembolsos');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4 — Editar el cobro ajusta sus gastos (y borra el que queda a cero)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c        _ctx%rowtype;
  v_cobro  record;
  v_dev_id uuid;
  v_com    numeric;
  v_existe boolean;
begin
  select * into c from _ctx;
  select * into v_cobro from public.cobros_pasarela where referencia = 'TEST-3';
  v_dev_id := v_cobro.movimiento_devolucion_id;

  perform pg_temp.suplantar(c.socio_a);
  update public.cobros_pasarela
     set comisiones = 12.00, devoluciones = 0, otros_ajustes = 0, importe_neto = 488.00
   where id = v_cobro.id
  returning * into v_cobro;
  perform pg_temp.volver();

  select total_eur into v_com from public.movimientos where id = v_cobro.movimiento_comision_id;
  select exists (select 1 from public.movimientos where id = v_dev_id) into v_existe;

  insert into _resultados values (
    4, 'Editar el cobro: la comisión pasa a 12 € y la devolución a 0 desaparece',
    'comisión 12.00 · devolución borrada',
    'comisión ' || coalesce(v_com::text, '—') || ' · devolución ' ||
      case when v_existe then 'SIGUE AHÍ' else 'borrada' end,
    v_com = 12.00 and not v_existe and v_cobro.movimiento_devolucion_id is null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5 — Un gasto generado no se toca desde /movimientos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c         _ctx%rowtype;
  v_mov     uuid;
  v_err_upd text;
  v_err_del text;
begin
  select * into c from _ctx;
  select movimiento_comision_id into v_mov from public.cobros_pasarela where referencia = 'TEST-1';

  perform pg_temp.suplantar(c.socio_a);
  begin
    update public.movimientos set base_imponible = 1, total = 1 where id = v_mov;
  exception when others then v_err_upd := sqlerrm;
  end;
  begin
    delete from public.movimientos where id = v_mov;
  exception when others then v_err_del := sqlerrm;
  end;
  perform pg_temp.volver();

  insert into _resultados values (
    5, 'El autor NO puede editar ni borrar el gasto generado por su cuenta',
    'las dos lanzan excepción', coalesce(v_err_upd, 'EDITÓ') || ' / ' || coalesce(v_err_del, 'BORRÓ'),
    v_err_upd like '%/cobros%' and v_err_del like '%/cobros%');
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6 — Solo el autor borra el cobro
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c   _ctx%rowtype;
  v_n int;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_b);
  delete from public.cobros_pasarela where referencia = 'TEST-1';
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    6, 'El otro socio NO puede borrar el cobro (la RLS lo deja en cero filas)',
    '0 filas', v_n || ' filas', v_n = 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 7 — Borrar el cobro arrastra sus gastos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c        _ctx%rowtype;
  v_cobro  record;
  v_quedan int;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  insert into public.cobros_pasarela (
    fecha_cobro, periodo_desde, periodo_hasta,
    importe_bruto, comisiones, devoluciones, importe_neto, referencia)
  values ('2030-05-10', '2030-05-01', '2030-05-07', 200.00, 6.00, 20.00, 174.00, 'TEST-7')
  returning * into v_cobro;

  delete from public.cobros_pasarela where id = v_cobro.id;
  perform pg_temp.volver();

  -- Fuerza ya las comprobaciones diferidas, como lo haría el commit.
  set constraints all immediate;

  select count(*) into v_quedan from public.movimientos
  where id in (v_cobro.movimiento_comision_id, v_cobro.movimiento_devolucion_id);

  insert into _resultados values (
    7, 'Borrar el cobro borra también su comisión y su devolución',
    '0 gastos generados', v_quedan || ' gastos generados', v_quedan = 0);
end $$;

set constraints all deferred;


-- ───────────────────────────────────────────────────────────────────────────
-- 8 — La misma referencia de payout no entra dos veces
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c       _ctx%rowtype;
  v_error text;
begin
  select * into c from _ctx;
  begin
    perform pg_temp.suplantar(c.socio_a);
    insert into public.cobros_pasarela (
      fecha_cobro, periodo_desde, periodo_hasta, importe_bruto, comisiones, importe_neto, referencia)
    values ('2030-03-07', '2030-03-01', '2030-03-03', 320.00, 9.60, 310.40, 'TEST-1');
  exception when unique_violation then
    v_error := sqlerrm;
  end;
  perform pg_temp.volver();

  insert into _resultados values (
    8, 'Registrar dos veces el mismo payout (misma referencia)',
    'unique_violation', coalesce(v_error, 'SE COLÓ'), v_error is not null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 9 — Saldo en banco: lo anticipado por un socio NO resta del banco
--
-- Se parte de la foto actual y se mide la diferencia de cada paso.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c        _ctx%rowtype;
  v_corte  date := '2030-12-31';
  v_antes  numeric;
  v_tras_anticipo numeric;
  v_tras_negocio  numeric;
  v_tras_cobro    numeric;
  v_tras_reemb    numeric;
  v_anticipo uuid;
begin
  select * into c from _ctx;
  select saldo_banco into v_antes from public.fn_saldo_banco(v_corte);

  perform pg_temp.suplantar(c.socio_a);
  -- 100 € de anuncios que pone el socio B de su bolsillo
  v_anticipo := pg_temp.mov('gasto', '2030-06-01', c.cat_ads, 100, c.socio_a, c.socio_b);
  perform pg_temp.volver();
  select saldo_banco into v_tras_anticipo from public.fn_saldo_banco(v_corte);

  perform pg_temp.suplantar(c.socio_a);
  -- 50 € que paga el negocio
  perform pg_temp.mov('gasto', '2030-06-02', c.cat_ads, 50, c.socio_a, null);
  perform pg_temp.volver();
  select saldo_banco into v_tras_negocio from public.fn_saldo_banco(v_corte);

  perform pg_temp.suplantar(c.socio_a);
  -- Llega un payout de 300 − 9 = 291 €. Su comisión NO debe restar otra vez.
  insert into public.cobros_pasarela (
    fecha_cobro, periodo_desde, periodo_hasta, importe_bruto, comisiones, importe_neto)
  values ('2030-06-05', '2030-06-01', '2030-06-03', 300.00, 9.00, 291.00);
  -- Y se le devuelven al socio B sus 100 €
  perform public.fn_registrar_reembolso(
    c.socio_b, '2030-06-06', 100, 'transferencia', null,
    jsonb_build_array(jsonb_build_object('movimiento_id', v_anticipo, 'importe_eur', 100)));
  perform pg_temp.volver();

  select saldo_banco into v_tras_cobro
  from public.fn_saldo_banco('2030-06-05');
  select saldo_banco into v_tras_reemb from public.fn_saldo_banco(v_corte);

  insert into _resultados values (
    9, 'Saldo en banco: anticipo del socio 0 · gasto del negocio −50 · payout +291 (comisión no resta dos veces) · reembolso −100',
    '0 · −50 · +291 · −100',
    concat_ws(' · ',
      v_tras_anticipo - v_antes,
      v_tras_negocio - v_tras_anticipo,
      v_tras_cobro - v_tras_negocio,
      v_tras_reemb - v_tras_cobro),
    v_tras_anticipo - v_antes = 0
      and v_tras_negocio - v_tras_anticipo = -50
      and v_tras_cobro - v_tras_negocio = 291
      and v_tras_reemb - v_tras_cobro = -100);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 10 — Pendiente en Shopify = ventas − brutos cobrados
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c         _ctx%rowtype;
  v_corte   date := '2030-12-31';
  v_antes   numeric;
  v_venta   numeric;
  v_cobrado numeric;
begin
  select * into c from _ctx;
  select pendiente_shopify into v_antes from public.fn_saldo_banco(v_corte);

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.mov('ingreso', '2030-07-01', c.cat_venta, 250, c.socio_a);
  perform pg_temp.volver();
  select pendiente_shopify into v_venta from public.fn_saldo_banco(v_corte);

  perform pg_temp.suplantar(c.socio_a);
  insert into public.cobros_pasarela (
    fecha_cobro, periodo_desde, periodo_hasta, importe_bruto, comisiones, importe_neto)
  values ('2030-07-04', '2030-07-01', '2030-07-01', 250.00, 7.50, 242.50);
  perform pg_temp.volver();
  select pendiente_shopify into v_cobrado from public.fn_saldo_banco(v_corte);

  insert into _resultados values (
    10, 'Pendiente en Shopify: +250 al registrar la venta, −250 al cobrarla',
    '+250 · −250',
    (v_venta - v_antes) || ' · ' || (v_cobrado - v_venta),
    v_venta - v_antes = 250 and v_cobrado - v_venta = -250);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 11 — Conciliación: 320 € según Shopify, 305 € en /diario → faltan 15 €
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c  _ctx%rowtype;
  v  record;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  perform pg_temp.mov('ingreso', '2030-08-01', c.cat_venta, 200, c.socio_a);
  perform pg_temp.mov('ingreso', '2030-08-02', c.cat_venta, 105, c.socio_a);
  -- Fuera del periodo: no debe contar.
  perform pg_temp.mov('ingreso', '2030-08-04', c.cat_venta, 999, c.socio_a);
  insert into public.cobros_pasarela (
    fecha_cobro, periodo_desde, periodo_hasta, importe_bruto, comisiones, importe_neto, referencia)
  values ('2030-08-05', '2030-08-01', '2030-08-03', 320.00, 9.60, 310.40, 'TEST-11');
  perform pg_temp.volver();

  select * into v from public.vw_cobros_conciliacion where referencia = 'TEST-11';

  insert into _resultados values (
    11, 'Conciliación: Shopify 320 €, /diario 305 € en el periodo → diferencia 15 €, no cuadra, 3 % de comisión',
    'ventas 305.00 · diferencia 15.00 · cuadra false · 3.00 %',
    concat_ws(' · ', 'ventas ' || v.ventas_registradas, 'diferencia ' || v.diferencia,
      'cuadra ' || v.cuadra, v.pct_comision || ' %'),
    v.ventas_registradas = 305 and v.diferencia = 15 and not v.cuadra and v.pct_comision = 3.00);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 12 — La liquidación usa el saldo en banco como caja disponible
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_caja  numeric;
  v_banco numeric;
begin
  select (public.fn_estado_liquidacion('2030-12-31') ->> 'caja_disponible')::numeric into v_caja;
  select saldo_banco into v_banco from public.fn_saldo_banco('2030-12-31');

  insert into _resultados values (
    12, 'fn_estado_liquidacion: caja_disponible = saldo en banco',
    'iguales', v_caja || ' / ' || v_banco, v_caja = v_banco);
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
