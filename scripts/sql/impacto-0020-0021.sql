-- Impacto de la 0020 y la 0021 en TheGlowCoSpain (se ejecuta dentro de BEGIN … ROLLBACK).
create temporary table _imp (momento text, ambito text, periodo text, ingresos numeric, gastos numeric,
  beneficio numeric, gasto_ads numeric, roas numeric) on commit drop;

create or replace function pg_temp.foto(p_momento text) returns void language plpgsql as $$
declare
  v_t uuid := (select id from public.tiendas where slug = 'theglowcospain');
  p record;
begin
  for p in select * from (values ('Total', date '2000-01-01', date '2100-12-31'),
                                 ('Septiembre', date '2026-09-01', date '2026-09-30'),
                                 ('Octubre', date '2026-10-01', date '2026-10-31')) x(n, d, h) loop
    insert into _imp
    select p_momento, 'TheGlowCoSpain', p.n, r.ingresos, r.gastos, r.beneficio, r.gasto_ads,
           case when r.gasto_ads > 0 then round(r.ingresos / r.gasto_ads, 2) end
    from public.fn_resumen_periodo(p.d, p.h, v_t, false) r;
    insert into _imp
    select p_momento, 'General', p.n, r.ingresos, r.gastos, r.beneficio, r.gasto_ads, null
    from public.fn_resumen_periodo(p.d, p.h, null, true) r;
    insert into _imp
    select p_momento, 'Todas', p.n, r.ingresos, r.gastos, r.beneficio, r.gasto_ads,
           case when r.gasto_ads > 0 then round(r.ingresos / r.gasto_ads, 2) end
    from public.fn_resumen_periodo(p.d, p.h, null, false) r;
  end loop;
  insert into _imp (momento, ambito, periodo, gastos)
  values (p_momento, 'Cupo tarjeta', 'consumido', (public.fn_cupo_tarjeta() ->> 'consumido')::numeric);
end $$;
