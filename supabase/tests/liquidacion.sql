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
