-- ═══════════════════════════════════════════════════════════════════════════
-- Tests de la liquidación entre socios
--
-- CÓMO EJECUTARLOS
--   Pega el archivo entero en el SQL Editor de Supabase y pulsa Run. Devuelve
--   una tabla con un PASA/FALLA por caso.
--
-- NO ESCRIBE NADA EN LA BASE DE DATOS.
--   · Los casos 1 a 7 atacan las funciones PURAS (fn_prorrata_calculo,
--     fn_liquidacion_calculo, fn_en_fase_inicial). No leen ni escriben tablas:
--     reciben los datos como jsonb. Por eso el cálculo del dinero se separó en
--     dos capas.
--   · Los casos 8 y 9 comprueban dos triggers, y para eso hacen falta filas.
--     Van dentro del BEGIN … ROLLBACK de este mismo archivo: nada llega a
--     confirmarse. La tabla de resultados es TEMPORARY y muere con la
--     transacción.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _resultados (
  n        int,
  caso     text,
  esperado text,
  obtenido text,
  ok       boolean
) on commit drop;


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
-- R6 — ÁMBITO DEL CUPO DE APORTACIÓN
-- ───────────────────────────────────────────────────────────────────────────

-- 12. El cupo de la tarjeta solo cuenta publicidad; el derecho a reembolso
--     cuenta todo. Un socio adelanta 800 € de anuncios y 200 € de una
--     herramienta: el cupo consume 800, pero se le deben 1.000.
--
--     Es la distinción que da sentido a la regla 6: los 3.000 € son el cupo
--     de una tarjeta destinada a publicidad, no un tope a lo que un socio
--     puede adelantar. Adelantar Shopify no gasta tarjeta, pero se devuelve
--     igual.
do $$
declare
  v_socio        uuid;
  v_publicidad   uuid;
  v_herramienta  uuid;
  v_cupo_antes   numeric;
  v_otros_antes  numeric;
  v_pend_antes   numeric;
  v_cupo         numeric;
  v_otros        numeric;
  v_pendiente    numeric;
begin
  select id into v_socio from public.profiles where activo = true limit 1;

  select id into v_publicidad
  from public.categorias where nombre = 'Publicidad' and tipo = 'gasto' limit 1;

  -- Una categoría que NO gasta tarjeta (desde la 0016 producto y envíos sí).
  select id into v_herramienta
  from public.categorias
  where nombre = 'Herramientas de IA y software' and tipo = 'gasto'
  limit 1;

  -- El ajuste apunta SOLO a Publicidad para aislar este caso del 14.
  update public.ajustes
  set valor = (valor - 'categoria_id')
              || jsonb_build_object('categoria_ids', jsonb_build_array(v_publicidad))
  where clave = 'limite_aportacion';

  -- Se mide por DIFERENCIA: los casos 10 y 11 ya dejaron anticipos de este
  -- mismo socio dentro de la transacción, y comparar contra cero daría un
  -- fallo que no es del código sino del orden de los tests.
  select coalesce(v.anticipado_cupo, 0), coalesce(v.anticipado_otros, 0),
         coalesce(v.pendiente, 0)
    into v_cupo_antes, v_otros_antes, v_pend_antes
  from public.vw_anticipos_socio v
  where v.socio_id = v_socio;

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, created_by)
  values
    ('gasto', '1990-03-01', 'TEST anuncios', v_publicidad, 'EUR',
     800, 0, 0, 800, 1, 800, 800, v_socio, v_socio),
    ('gasto', '1990-03-02', 'TEST herramienta', v_herramienta, 'EUR',
     200, 0, 0, 200, 1, 200, 200, v_socio, v_socio);

  select v.anticipado_cupo - v_cupo_antes,
         v.anticipado_otros - v_otros_antes,
         v.pendiente - v_pend_antes
    into v_cupo, v_otros, v_pendiente
  from public.vw_anticipos_socio v
  where v.socio_id = v_socio;

  insert into _resultados values (
    12,
    'Cupo publicitario: 800 € de anuncios + 200 € de herramienta',
    'cupo=+800.00, otros=+200.00, pendiente=+1000.00',
    'cupo=' || coalesce(v_cupo::text, 'null')
      || ', otros=' || coalesce(v_otros::text, 'null')
      || ', pendiente=' || coalesce(v_pendiente::text, 'null'),
    v_cupo = 800.00 and v_otros = 200.00 and v_pendiente = 1000.00);
end $$;


-- 13. Sin ámbito definido (ni categoria_ids ni categoria_id) se comporta como
--     antes: el cupo suma TODOS los anticipos. Es la compatibilidad hacia
--     atrás que prometen las migraciones 0011 y 0016.
do $$
declare
  v_socio       uuid;
  v_categoria   uuid;
  v_cupo        numeric;
  v_otros       numeric;
  v_anticipado  numeric;
begin
  select id into v_socio from public.profiles where activo = true limit 1;
  select id into v_categoria from public.categorias where tipo = 'gasto' limit 1;

  update public.ajustes
  set valor = (valor - 'categoria_ids') || '{"categoria_id": null}'::jsonb
  where clave = 'limite_aportacion';

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, created_by)
  values ('gasto', '1990-04-01', 'TEST sin ambito', v_categoria, 'EUR',
          150, 0, 0, 150, 1, 150, 150, v_socio, v_socio);

  select v.anticipado, v.anticipado_cupo, v.anticipado_otros
    into v_anticipado, v_cupo, v_otros
  from public.vw_anticipos_socio v
  where v.socio_id = v_socio;

  insert into _resultados values (
    13,
    'Sin ámbito (sin categorías): el cupo vuelve a sumarlo todo',
    'cupo = anticipado, otros=0.00',
    'cupo=' || coalesce(v_cupo::text, 'null')
      || ', anticipado=' || coalesce(v_anticipado::text, 'null')
      || ', otros=' || coalesce(v_otros::text, 'null'),
    v_cupo = v_anticipado and v_otros = 0.00);
end $$;

-- 14. Desde la 0016 la tarjeta paga también producto y envío: un socio
--     adelanta 100 € de anuncios, 60 € de producto a CJ, 15 € de envío y 40 €
--     de una herramienta. El cupo consume 175; la herramienta sigue fuera.
do $$
declare
  v_socio       uuid;
  v_publicidad  uuid;
  v_producto    uuid;
  v_envio       uuid;
  v_herramienta uuid;
  v_cupo_antes  numeric;
  v_otros_antes numeric;
  v_cupo        numeric;
  v_otros       numeric;
begin
  select id into v_socio from public.profiles where activo = true limit 1;
  select id into v_publicidad  from public.categorias where nombre = 'Publicidad' and tipo = 'gasto';
  select id into v_producto    from public.categorias where nombre = 'Coste de producto' and tipo = 'gasto';
  select id into v_envio       from public.categorias where nombre = 'Envíos y logística' and tipo = 'gasto';
  select id into v_herramienta from public.categorias where nombre = 'Herramientas de IA y software' and tipo = 'gasto';

  -- El ámbito tal como lo deja la 0016.
  update public.ajustes
  set valor = (valor - 'categoria_id')
              || jsonb_build_object('categoria_ids',
                   jsonb_build_array(v_publicidad, v_producto, v_envio))
  where clave = 'limite_aportacion';

  select coalesce(v.anticipado_cupo, 0), coalesce(v.anticipado_otros, 0)
    into v_cupo_antes, v_otros_antes
  from public.vw_anticipos_socio v where v.socio_id = v_socio;

  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur, anticipado_por, created_by)
  values
    ('gasto', '1990-05-01', 'TEST anuncios',    v_publicidad,  'EUR', 100, 0, 0, 100, 1, 100, 100, v_socio, v_socio),
    ('gasto', '1990-05-02', 'TEST CJ producto', v_producto,    'EUR',  60, 0, 0,  60, 1,  60,  60, v_socio, v_socio),
    ('gasto', '1990-05-03', 'TEST envío',       v_envio,       'EUR',  15, 0, 0,  15, 1,  15,  15, v_socio, v_socio),
    ('gasto', '1990-05-04', 'TEST herramienta', v_herramienta, 'EUR',  40, 0, 0,  40, 1,  40,  40, v_socio, v_socio);

  select v.anticipado_cupo - v_cupo_antes, v.anticipado_otros - v_otros_antes
    into v_cupo, v_otros
  from public.vw_anticipos_socio v where v.socio_id = v_socio;

  insert into _resultados values (
    14,
    'Cupo de la tarjeta: anuncios 100 + producto 60 + envío 15 entran; herramienta 40 no',
    'cupo=+175.00, otros=+40.00',
    'cupo=' || coalesce(v_cupo::text, 'null') || ', otros=' || coalesce(v_otros::text, 'null'),
    v_cupo = 175.00 and v_otros = 40.00);
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
