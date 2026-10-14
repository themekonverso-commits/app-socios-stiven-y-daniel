-- ═══════════════════════════════════════════════════════════════════════════
-- Tests de la liquidación entre socios
--
-- CÓMO EJECUTARLOS
--   Pega el archivo entero en el SQL Editor de Supabase y pulsa Run. Devuelve
--   una tabla con un PASA/FALLA por caso.
--
-- NO ESCRIBE NADA EN LA BASE DE DATOS.
--   · Los casos 1 a 8 atacan las funciones PURAS (fn_prorrata_calculo,
--     fn_liquidacion_calculo, fn_en_fase_inicial). No leen ni escriben tablas:
--     reciben los datos como jsonb. Por eso el cálculo del dinero se separó en
--     dos capas.
--   · Los casos 9 a 14 comprueban triggers y vistas, y para eso hacen falta
--     filas. Van dentro del BEGIN … ROLLBACK de este mismo archivo: nada llega
--     a confirmarse. La tabla de resultados y la tienda de pruebas
--     (slug test-liquidacion) mueren con la transacción.
--   · Desde la 0018 el cupo de la tarjeta (R6) no va por categorías: cuenta
--     los gastos con medio_pago = 'tarjeta_daniel', de todas las tiendas y de
--     General.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _resultados (
  n        int,
  caso     text,
  esperado text,
  obtenido text,
  ok       boolean
) on commit drop;

-- Tienda de pruebas (0018): los gastos de los casos del cupo se reparten
-- entre ella y General para comprobar que el cupo es global.
insert into public.tiendas (nombre, slug, created_by)
select 'TEST tienda liquidación', 'test-liquidacion', p.id
from public.profiles p where p.activo = true order by p.nombre limit 1;


-- ───────────────────────────────────────────────────────────────────────────
-- R3.2 — PRORRATA
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Fondos insuficientes: A debe 1000, B debe 500, hay 600 → 400 y 200.
insert into _resultados
select 1,
  'Prorrata con fondos insuficientes (1000/500, caja 600)',
  '400.00 / 200.00',
  (r ->> 'A') || ' / ' || (r ->> 'B'),
  (r ->> 'A')::numeric = 400.00 and (r ->> 'B')::numeric = 200.00
from (select public.fn_prorrata_calculo('{"A": 1000, "B": 500}'::jsonb, 600) as r) t;

-- 2. Fondos exactos: cada uno cobra su pendiente íntegro.
insert into _resultados
select 2,
  'Prorrata con fondos exactos (1000/500, caja 1500)',
  '1000.00 / 500.00',
  (r ->> 'A') || ' / ' || (r ->> 'B'),
  (r ->> 'A')::numeric = 1000.00 and (r ->> 'B')::numeric = 500.00
from (select public.fn_prorrata_calculo('{"A": 1000, "B": 500}'::jsonb, 1500) as r) t;

-- 3. Sobra caja: nadie cobra más de lo que se le debe.
insert into _resultados
select 3,
  'Prorrata con caja de sobra (1000/500, caja 5000): nadie cobra de más',
  '1000.00 / 500.00',
  (r ->> 'A') || ' / ' || (r ->> 'B'),
  (r ->> 'A')::numeric = 1000.00 and (r ->> 'B')::numeric = 500.00
from (select public.fn_prorrata_calculo('{"A": 1000, "B": 500}'::jsonb, 5000) as r) t;

-- 4. Un solo socio con pendiente: se lo lleva todo, el otro cero.
insert into _resultados
select 4,
  'Prorrata con un solo socio con pendiente (800/0, caja 300)',
  '300.00 / 0.00',
  (r ->> 'A') || ' / ' || (r ->> 'B'),
  (r ->> 'A')::numeric = 300.00 and (r ->> 'B')::numeric = 0.00
from (select public.fn_prorrata_calculo('{"A": 800, "B": 0}'::jsonb, 300) as r) t;

-- 5. El céntimo del redondeo. 1 € entre tres partes iguales da 0,33 × 3 = 0,99:
--    el céntimo que falta tiene que asignarse, o el reparto no cuadra.
insert into _resultados
select 5,
  'Prorrata: el céntimo del redondeo se asigna y la suma cuadra exacta',
  '1.00',
  to_char((r ->> 'A')::numeric + (r ->> 'B')::numeric + (r ->> 'C')::numeric, 'FM990D00'),
  ((r ->> 'A')::numeric + (r ->> 'B')::numeric + (r ->> 'C')::numeric) = 1.00
from (select public.fn_prorrata_calculo('{"A": 1, "B": 1, "C": 1}'::jsonb, 1) as r) t;


-- ───────────────────────────────────────────────────────────────────────────
-- R7 — LIQUIDACIÓN FINAL
-- ───────────────────────────────────────────────────────────────────────────

-- 6. Anticipos desiguales: A puso 1850 y cobró 400 (neto 1450), B nada.
--    Neto total 1450, mitad 725 → B le debe 725 a A.
insert into _resultados
select 6,
  'Liquidación final con anticipos desiguales (neto 1450 / 0)',
  'acreedor=A deudor=B importe=725.00',
  'acreedor=' || coalesce(r ->> 'acreedor_id', 'null') ||
  ' deudor=' || coalesce(r ->> 'deudor_id', 'null') ||
  ' importe=' || (r ->> 'importe_a_compensar'),
  (r ->> 'acreedor_id') = 'A'
  and (r ->> 'deudor_id') = 'B'
  and (r ->> 'importe_a_compensar')::numeric = 725.00
from (
  select public.fn_liquidacion_calculo(
    '{"A": {"anticipado": 1850, "reembolsado": 400},
      "B": {"anticipado": 0,    "reembolsado": 0}}'::jsonb) as r
) t;

-- 7. Anticipos iguales: nadie debe nada a nadie.
insert into _resultados
select 7,
  'Liquidación final con anticipos iguales (neto 500 / 500)',
  'sin deudor ni acreedor, importe=0.00',
  'acreedor=' || coalesce(r ->> 'acreedor_id', 'null') ||
  ' deudor=' || coalesce(r ->> 'deudor_id', 'null') ||
  ' importe=' || (r ->> 'importe_a_compensar'),
  (r ->> 'acreedor_id') is null
  and (r ->> 'deudor_id') is null
  and (r ->> 'importe_a_compensar')::numeric = 0.00
from (
  select public.fn_liquidacion_calculo(
    '{"A": {"anticipado": 700, "reembolsado": 200},
      "B": {"anticipado": 500, "reembolsado": 0}}'::jsonb) as r
) t;


-- ───────────────────────────────────────────────────────────────────────────
-- R5 — FASE INICIAL
-- ───────────────────────────────────────────────────────────────────────────

-- 8. Dentro de los 3 meses bloquea; justo al cumplirse, ya no.
insert into _resultados
select 8,
  'Fase Inicial: bloquea dentro de los 3 meses y deja de bloquear después',
  'dentro=true / justo al límite=false / después=false',
  'dentro=' || public.fn_en_fase_inicial('2026-10-15', '2026-09-07', 3)::text ||
  ' / justo al límite=' || public.fn_en_fase_inicial('2026-12-07', '2026-09-07', 3)::text ||
  ' / después=' || public.fn_en_fase_inicial('2027-01-10', '2026-09-07', 3)::text,
  public.fn_en_fase_inicial('2026-10-15', '2026-09-07', 3) = true
  and public.fn_en_fase_inicial('2026-12-07', '2026-09-07', 3) = false
  and public.fn_en_fase_inicial('2027-01-10', '2026-09-07', 3) = false;


-- ───────────────────────────────────────────────────────────────────────────
-- INTEGRIDAD — estos dos necesitan filas, y por eso todo va en una
-- transacción que termina en ROLLBACK. Nada se confirma.
-- ───────────────────────────────────────────────────────────────────────────

-- 9. Un cierre aprobado no se puede modificar.
do $$
declare
  v_socio   uuid;
  v_cierre  uuid;
  v_fallo   boolean := false;
  v_mensaje text := 'no lanzó excepción: el cierre SE MODIFICÓ';
begin
  select id into v_socio from public.profiles limit 1;

  insert into public.cierres (
    etiqueta, periodo_inicio, periodo_fin,
    ingresos_eur, gastos_eur, resultado_eur, base_distribuible_eur, created_by)
  values ('TEST', '1990-01-01', '1990-03-31', 0, 0, 0, 0, v_socio)
  returning id into v_cierre;

  -- Aprobarlo sí está permitido: es el paso de borrador a aprobado.
  update public.cierres set estado = 'aprobado' where id = v_cierre;

  begin
    update public.cierres set notas = 'intento de manipulación' where id = v_cierre;
  exception when others then
    v_fallo := true;
    v_mensaje := sqlerrm;
  end;

  insert into _resultados values (
    9, 'Un cierre aprobado NO se puede modificar', 'lanza excepción', v_mensaje, v_fallo);
end $$;

-- 10. Un reembolso no puede superar lo pendiente del anticipo.
do $$
declare
  v_socio     uuid;
  v_categoria uuid;
  v_mov       uuid;
  v_reembolso uuid;
  v_fallo     boolean := false;
  v_mensaje   text := 'no lanzó excepción: SE ACEPTÓ un reembolso excesivo';
begin
  select id into v_socio from public.profiles limit 1;
  select id into v_categoria from public.categorias where tipo = 'gasto' limit 1;

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, created_by)
  values ('gasto', '1990-01-01', 'TEST anticipo', v_categoria, 'EUR',
          500, 0, 0, 500, 1, 500, 500, v_socio, v_socio)
  returning id into v_mov;

  insert into public.reembolsos (fecha, socio_id, importe_eur, created_by)
  values ('1990-01-02', v_socio, 900, v_socio)
  returning id into v_reembolso;

  begin
    -- 900 € sobre un anticipo de 500 €: debe rebotar.
    insert into public.reembolso_movimientos (reembolso_id, movimiento_id, importe_eur)
    values (v_reembolso, v_mov, 900);
  exception when others then
    v_fallo := true;
    v_mensaje := sqlerrm;
  end;

  insert into _resultados values (
    10, 'Un reembolso NO puede superar lo pendiente del anticipo',
    'lanza excepción', v_mensaje, v_fallo);
end $$;

-- 11. Un reembolso PARCIAL deja pendiente el resto, no marca el anticipo
--     como saldado. Es el error más caro que podría cometer esta app.
do $$
declare
  v_socio     uuid;
  v_categoria uuid;
  v_mov       uuid;
  v_reembolso uuid;
  v_pendiente numeric;
  v_flag      boolean;
begin
  select id into v_socio from public.profiles limit 1;
  select id into v_categoria from public.categorias where tipo = 'gasto' limit 1;

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, created_by)
  values ('gasto', '1990-02-01', 'TEST parcial', v_categoria, 'EUR',
          500, 0, 0, 500, 1, 500, 500, v_socio, v_socio)
  returning id into v_mov;

  insert into public.reembolsos (fecha, socio_id, importe_eur, created_by)
  values ('1990-02-02', v_socio, 300, v_socio)
  returning id into v_reembolso;

  insert into public.reembolso_movimientos (reembolso_id, movimiento_id, importe_eur)
  values (v_reembolso, v_mov, 300);

  select v.pendiente_eur into v_pendiente
  from public.vw_anticipos_pendientes v where v.id = v_mov;

  select m.reembolsado into v_flag from public.movimientos m where m.id = v_mov;

  insert into _resultados values (
    11, 'Reembolso parcial de 300 € sobre 500 €: quedan 200 € pendientes',
    'pendiente=200.00, saldado=false',
    'pendiente=' || coalesce(v_pendiente::text, 'null') || ', saldado=' || coalesce(v_flag::text, 'null'),
    v_pendiente = 200.00 and v_flag = false);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- R6 — ÁMBITO DEL CUPO DE APORTACIÓN (desde la 0018: el medio de pago)
-- ───────────────────────────────────────────────────────────────────────────

-- 12. El cupo solo cuenta lo pagado con la tarjeta; el derecho a reembolso
--     cuenta todo. El socio de la tarjeta paga 800 € de anuncios con la
--     tarjeta y 200 € de una herramienta de su bolsillo: el cupo consume 800,
--     pero se le deben 1.000.
--
--     Es la distinción que da sentido a la regla 6: los 3.000 € son el cupo
--     de una tarjeta, no un tope a lo que un socio puede adelantar. Adelantar
--     de su bolsillo no gasta tarjeta, pero se devuelve igual.
do $$
declare
  v_socio        uuid;
  v_tienda       uuid;
  v_publicidad   uuid;
  v_herramienta  uuid;
  v_cupo_antes   numeric;
  v_otros_antes  numeric;
  v_pend_antes   numeric;
  v_cupo         numeric;
  v_otros        numeric;
  v_pendiente    numeric;
begin
  -- El titular de la tarjeta sale del ajuste, no de un nombre.
  v_socio := public.fn_socio_tarjeta();
  select id into v_tienda from public.tiendas where slug = 'test-liquidacion';

  select id into v_publicidad
  from public.categorias where nombre = 'Publicidad' and tipo = 'gasto' limit 1;

  select id into v_herramienta
  from public.categorias
  where nombre = 'Herramientas de IA y software' and tipo = 'gasto'
  limit 1;

  -- Se mide por DIFERENCIA: los casos 10 y 11 pueden haber dejado anticipos
  -- de este mismo socio dentro de la transacción, y la base real ya tiene los
  -- suyos; comparar contra cero daría un fallo que no es del código.
  select coalesce(v.anticipado_cupo, 0), coalesce(v.anticipado_otros, 0),
         coalesce(v.pendiente, 0)
    into v_cupo_antes, v_otros_antes, v_pend_antes
  from public.vw_anticipos_socio v
  where v.socio_id = v_socio;

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, medio_pago, tienda_id, created_by)
  values
    ('gasto', '1990-03-01', 'TEST anuncios', v_publicidad, 'EUR',
     800, 0, 0, 800, 1, 800, 800, v_socio, 'tarjeta_daniel', v_tienda, v_socio),
    ('gasto', '1990-03-02', 'TEST herramienta', v_herramienta, 'EUR',
     200, 0, 0, 200, 1, 200, 200, v_socio, 'bolsillo', null, v_socio);

  select v.anticipado_cupo - v_cupo_antes,
         v.anticipado_otros - v_otros_antes,
         v.pendiente - v_pend_antes
    into v_cupo, v_otros, v_pendiente
  from public.vw_anticipos_socio v
  where v.socio_id = v_socio;

  insert into _resultados values (
    12,
    'Cupo de la tarjeta: 800 € de anuncios con tarjeta + 200 € de herramienta de bolsillo',
    'cupo=+800.00, otros=+200.00, pendiente=+1000.00',
    'cupo=' || coalesce(v_cupo::text, 'null')
      || ', otros=' || coalesce(v_otros::text, 'null')
      || ', pendiente=' || coalesce(v_pendiente::text, 'null'),
    v_cupo = 800.00 and v_otros = 200.00 and v_pendiente = 1000.00);
end $$;


-- 13. Un gasto con la tarjeta es siempre un anticipo del titular: aunque
--     llegue sin anticipado_por, el trigger lo fija al socio de la tarjeta.
--     Sube el cupo y el anticipado en lo mismo; «otros» no se mueve, y
--     fn_cupo_tarjeta() lo cuenta como consumido.
do $$
declare
  v_socio        uuid;
  v_categoria    uuid;
  v_mov          uuid;
  v_quien        uuid;
  v_cupo_antes   numeric;
  v_otros_antes  numeric;
  v_ant_antes    numeric;
  v_cons_antes   numeric;
  v_cupo         numeric;
  v_otros        numeric;
  v_anticipado   numeric;
  v_consumido    numeric;
begin
  v_socio := public.fn_socio_tarjeta();
  select id into v_categoria from public.categorias where tipo = 'gasto' limit 1;

  select coalesce(v.anticipado_cupo, 0), coalesce(v.anticipado_otros, 0), coalesce(v.anticipado, 0)
    into v_cupo_antes, v_otros_antes, v_ant_antes
  from public.vw_anticipos_socio v where v.socio_id = v_socio;
  v_cons_antes := (public.fn_cupo_tarjeta() ->> 'consumido')::numeric;

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, medio_pago, created_by)
  values ('gasto', '1990-04-01', 'TEST tarjeta sin socio', v_categoria, 'EUR',
          150, 0, 0, 150, 1, 150, 150, null, 'tarjeta_daniel', v_socio)
  returning id, anticipado_por into v_mov, v_quien;

  select v.anticipado - v_ant_antes, v.anticipado_cupo - v_cupo_antes,
         v.anticipado_otros - v_otros_antes
    into v_anticipado, v_cupo, v_otros
  from public.vw_anticipos_socio v
  where v.socio_id = v_socio;
  v_consumido := (public.fn_cupo_tarjeta() ->> 'consumido')::numeric - v_cons_antes;

  insert into _resultados values (
    13,
    'Gasto con tarjeta sin socio: lo adelanta el titular y sube cupo y anticipado por igual',
    'titular=sí, cupo=+150.00, anticipado=+150.00, otros=+0.00, consumido=+150.00',
    'titular=' || case when v_quien = v_socio then 'sí' else coalesce(v_quien::text, 'null') end
      || ', cupo=+' || coalesce(v_cupo::text, 'null')
      || ', anticipado=+' || coalesce(v_anticipado::text, 'null')
      || ', otros=+' || coalesce(v_otros::text, 'null')
      || ', consumido=+' || coalesce(v_consumido::text, 'null'),
    v_quien = v_socio and v_cupo = 150.00 and v_anticipado = 150.00
      and v_otros = 0.00 and v_consumido = 150.00);
end $$;

-- 14. Desde la 0018 la categoría ya no decide: el titular paga con la
--     tarjeta 100 € de anuncios, 60 € de producto a CJ, 15 € de envío y 40 €
--     de una herramienta (unos en la tienda de pruebas y otros en General), y
--     30 € más de anuncios de su bolsillo. El cupo consume 215; los anuncios
--     de bolsillo van a «otros». Un gasto del banco no toca los anticipos.
do $$
declare
  v_socio       uuid;
  v_tienda      uuid;
  v_publicidad  uuid;
  v_producto    uuid;
  v_envio       uuid;
  v_herramienta uuid;
  v_cupo_antes  numeric;
  v_otros_antes numeric;
  v_ant_antes   numeric;
  v_cons_antes  numeric;
  v_cupo        numeric;
  v_otros       numeric;
  v_anticipado  numeric;
  v_consumido   numeric;
begin
  v_socio := public.fn_socio_tarjeta();
  select id into v_tienda      from public.tiendas where slug = 'test-liquidacion';
  select id into v_publicidad  from public.categorias where nombre = 'Publicidad' and tipo = 'gasto';
  select id into v_producto    from public.categorias where nombre = 'Coste de producto' and tipo = 'gasto';
  select id into v_envio       from public.categorias where nombre = 'Envíos y logística' and tipo = 'gasto';
  select id into v_herramienta from public.categorias where nombre = 'Herramientas de IA y software' and tipo = 'gasto';

  select coalesce(v.anticipado_cupo, 0), coalesce(v.anticipado_otros, 0), coalesce(v.anticipado, 0)
    into v_cupo_antes, v_otros_antes, v_ant_antes
  from public.vw_anticipos_socio v where v.socio_id = v_socio;
  v_cons_antes := (public.fn_cupo_tarjeta() ->> 'consumido')::numeric;

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, medio_pago, tienda_id, created_by)
  values
    ('gasto', '1990-05-01', 'TEST anuncios',          v_publicidad,  'EUR', 100, 0, 0, 100, 1, 100, 100, v_socio, 'tarjeta_daniel', v_tienda, v_socio),
    ('gasto', '1990-05-02', 'TEST CJ producto',       v_producto,    'EUR',  60, 0, 0,  60, 1,  60,  60, v_socio, 'tarjeta_daniel', v_tienda, v_socio),
    ('gasto', '1990-05-03', 'TEST envío',             v_envio,       'EUR',  15, 0, 0,  15, 1,  15,  15, v_socio, 'tarjeta_daniel', null,     v_socio),
    ('gasto', '1990-05-04', 'TEST herramienta',       v_herramienta, 'EUR',  40, 0, 0,  40, 1,  40,  40, v_socio, 'tarjeta_daniel', null,     v_socio),
    ('gasto', '1990-05-05', 'TEST anuncios bolsillo', v_publicidad,  'EUR',  30, 0, 0,  30, 1,  30,  30, v_socio, 'bolsillo',       v_tienda, v_socio),
    ('gasto', '1990-05-06', 'TEST anuncios banco',    v_publicidad,  'EUR',  25, 0, 0,  25, 1,  25,  25, null,    'banco',          v_tienda, v_socio);

  select v.anticipado_cupo - v_cupo_antes, v.anticipado_otros - v_otros_antes,
         v.anticipado - v_ant_antes
    into v_cupo, v_otros, v_anticipado
  from public.vw_anticipos_socio v where v.socio_id = v_socio;
  v_consumido := (public.fn_cupo_tarjeta() ->> 'consumido')::numeric - v_cons_antes;

  insert into _resultados values (
    14,
    'Cupo de la tarjeta: anuncios 100 + producto 60 + envío 15 + herramienta 40 con tarjeta entran; 30 de bolsillo y 25 del banco no',
    'cupo=+215.00, otros=+30.00, anticipado=+245.00, consumido=+215.00',
    'cupo=+' || coalesce(v_cupo::text, 'null') || ', otros=+' || coalesce(v_otros::text, 'null')
      || ', anticipado=+' || coalesce(v_anticipado::text, 'null')
      || ', consumido=+' || coalesce(v_consumido::text, 'null'),
    v_cupo = 215.00 and v_otros = 30.00 and v_anticipado = 245.00 and v_consumido = 215.00);
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
