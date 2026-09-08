-- ═══════════════════════════════════════════════════════════════════════════
-- Tests del resumen de IVA
--
-- Comprueba lo único que de verdad importa de este bloque: que la suma de los
-- subtotales por tipo cuadre AL CÉNTIMO con el total general.
--
-- Se ejecuta dentro de BEGIN … ROLLBACK: no confirma ni una fila.
-- Pega el archivo entero en el SQL Editor de Supabase y pulsa Run.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _r (n int, caso text, esperado text, obtenido text, ok boolean)
  on commit drop;

do $$
declare
  v_socio uuid;
  v_cat_i uuid;
  v_cat_g uuid;
  v_res   jsonb;
  v_ci    jsonb;
  v_cg    jsonb;

  procedure_dummy int;
begin
  select id into v_socio from public.profiles limit 1;
  select id into v_cat_i from public.categorias where tipo = 'ingreso' limit 1;
  select id into v_cat_g from public.categorias where tipo = 'gasto'   limit 1;

  -- Un juego de datos deliberadamente incómodo:
  --   · los cuatro tipos oficiales de IVA
  --   · importes que no redondean limpio (33,33 al 21 %)
  --   · una factura en USD, donde base_eur y total_eur se redondean por
  --     separado y es donde aparecería el descuadre de un céntimo
  --   · un tipo NO estándar (5,5 %) que no debe perderse por el camino
  insert into public.movimientos
    (tipo, fecha, concepto, categoria_id, divisa,
     base_imponible, iva_tipo, iva_importe, total,
     tasa_cambio, total_eur, base_eur, created_by)
  values
    ('ingreso','1990-01-05','TEST venta 21',  v_cat_i,'EUR', 33.33, 21,  7.00,  40.33, 1,       40.33,  33.33, v_socio),
    ('ingreso','1990-01-06','TEST venta 10',  v_cat_i,'EUR', 77.77, 10,  7.78,  85.55, 1,       85.55,  77.77, v_socio),
    ('ingreso','1990-01-07','TEST venta 4',   v_cat_i,'EUR', 11.11,  4,  0.44,  11.55, 1,       11.55,  11.11, v_socio),
    ('ingreso','1990-01-08','TEST venta 0',   v_cat_i,'EUR', 50.00,  0,  0.00,  50.00, 1,       50.00,  50.00, v_socio),
    ('ingreso','1990-01-09','TEST venta USD', v_cat_i,'USD', 99.99, 21, 21.00, 120.99, 0.923456, 111.71, 92.32, v_socio),
    ('gasto',  '1990-01-10','TEST gasto 21',  v_cat_g,'EUR', 66.66, 21, 14.00,  80.66, 1,       80.66,  66.66, v_socio),
    ('gasto',  '1990-01-11','TEST gasto raro',v_cat_g,'EUR', 40.00, 5.5, 2.20,  42.20, 1,       42.20,  40.00, v_socio);

  v_res := public.fn_resumen_iva('1990-01-01', '1990-01-31');
  v_ci  := v_res -> 'cuadre' -> 'ingresos';
  v_cg  := v_res -> 'cuadre' -> 'gastos';

  -- 1. Los subtotales de ingresos cuadran con el total general.
  insert into _r values (1,
    'INGRESOS: la suma de los subtotales por tipo cuadra con el total general',
    'descuadre 0,00 en base, cuota y total',
    'base=' || (v_ci ->> 'descuadre_base') ||
    ' cuota=' || (v_ci ->> 'descuadre_cuota') ||
    ' total=' || (v_ci ->> 'descuadre_total'),
    (v_ci ->> 'cuadra')::boolean);

  -- 2. Lo mismo en gastos.
  insert into _r values (2,
    'GASTOS: la suma de los subtotales por tipo cuadra con el total general',
    'descuadre 0,00 en base, cuota y total',
    'base=' || (v_cg ->> 'descuadre_base') ||
    ' cuota=' || (v_cg ->> 'descuadre_cuota') ||
    ' total=' || (v_cg ->> 'descuadre_total'),
    (v_cg ->> 'cuadra')::boolean);

  -- 3. La factura en USD cuadra fila a fila: base + cuota = total.
  insert into _r values (3,
    'La factura en USD cuadra: base_eur + cuota = total_eur',
    '92.32 + 19.39 = 111.71',
    (select base_eur || ' + ' || cuota_eur || ' = ' || total_eur
       from public.vw_libro_gestoria where concepto = 'TEST venta USD'),
    (select round(base_eur + cuota_eur, 2) = total_eur
       from public.vw_libro_gestoria where concepto = 'TEST venta USD'));

  -- 4. El tipo no estándar del 5,5 % no se pierde: aparece agrupado aparte.
  insert into _r values (4,
    'Un tipo de IVA no estándar (5,5 %) se agrupa aparte, no se descarta',
    'hay_tipos_no_estandar = true',
    'hay_tipos_no_estandar = ' || (v_cg ->> 'hay_tipos_no_estandar'),
    (v_cg ->> 'hay_tipos_no_estandar')::boolean);

  -- 5. La diferencia del 303 es repercutido − soportado.
  insert into _r values (5,
    'Diferencia de IVA = repercutido − soportado',
    (v_res ->> 'iva_repercutido')::numeric - (v_res ->> 'iva_soportado')::numeric || '',
    (v_res ->> 'diferencia'),
    round((v_res ->> 'iva_repercutido')::numeric - (v_res ->> 'iva_soportado')::numeric, 2)
      = (v_res ->> 'diferencia')::numeric);

  -- 6. El nº de operaciones de los subtotales suma el total de operaciones.
  insert into _r values (6,
    'El número de operaciones de los subtotales suma el total',
    (v_res -> 'ingresos' ->> 'operaciones'),
    (select coalesce(sum((f ->> 'operaciones')::int), 0)::text
       from jsonb_array_elements(v_res -> 'ingresos' -> 'por_tipo') f),
    (select coalesce(sum((f ->> 'operaciones')::int), 0)
       from jsonb_array_elements(v_res -> 'ingresos' -> 'por_tipo') f)
      = (v_res -> 'ingresos' ->> 'operaciones')::int);
end $$;

select n,
       case when ok then 'PASA' else 'FALLA' end as resultado,
       caso, esperado, obtenido
from _r order by n;

rollback;
