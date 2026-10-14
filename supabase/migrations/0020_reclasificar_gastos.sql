-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — Reclasificación de gastos (decidida por los socios el 2026-10-14)
--
-- Separada de la 0018 a propósito: la 0018 tenía que dejar todas las cifras
-- idénticas. Esta SÍ cambia cómo se reparten los gastos entre tiendas y
-- categorías, pero no el total de la sociedad: ni el consolidado, ni la
-- liquidación, ni la caja, ni los anticipos se mueven un céntimo (lo comprueba
-- al final).
--
--   1. A General / Sociedad, 7 gastos compartidos (174,01 €): Apimart ×5,
--      Claude_Sep y CapCut.
--   2. Mal clasificados en «Herramientas de IA y software»: los 3 «Meta ads»
--      de septiembre → Publicidad; el «CJ» del 01/10 → Coste de producto.
--   3. Categoría nueva «Suscripción Shopify y apps», y a ella los dos pagos
--      de Shopify (siguen en TheGlowCoSpain: Shopify es de cada tienda).
--
-- Se hace por id, con el concepto y el importe esperados: si alguna fila no
-- coincide (la editaron entre medias), no se aplica nada.
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table _antes_0020 on commit drop as
select
  (select to_jsonb(r) from public.fn_resumen_periodo('2000-01-01', '2100-12-31', null, false) r) as resumen,
  public.fn_estado_liquidacion(current_date) as liquidacion,
  (select to_jsonb(t) from public.fn_tesoreria(current_date) t) as tesoreria,
  (select jsonb_agg(to_jsonb(a) order by a.socio_id) from public.vw_anticipos_socio a) as anticipos;

insert into public.categorias (nombre, tipo, es_sistema, orden)
values ('Suscripción Shopify y apps', 'gasto', false, 100)
on conflict (nombre, tipo) do nothing;

do $$
declare
  v_general uuid := null;
  v_ads     uuid := (select id from public.categorias where nombre = 'Publicidad' and tipo = 'gasto');
  v_prod    uuid := (select id from public.categorias where nombre = 'Coste de producto' and tipo = 'gasto');
  v_shop    uuid := (select id from public.categorias where nombre = 'Suscripción Shopify y apps' and tipo = 'gasto');
  v_fila    record;
  v_n       int;
begin
  if v_ads is null or v_prod is null or v_shop is null then
    raise exception 'Falta alguna categoría (Publicidad, Coste de producto o Suscripción Shopify y apps).';
  end if;

  create temporary table _cambios (
    id uuid primary key, concepto text, total numeric, a_general boolean, categoria uuid
  ) on commit drop;

  insert into _cambios values
    -- 1. A General (174,01 €)
    ('aeb4ef06-ffcb-4e64-b36a-79d9f631033d', 'Apimart',    10.00, true,  null),
    ('6ad99a08-f2f5-461b-933b-58e1bae950e6', 'Apimart',    10.00, true,  null),
    ('a603f9f9-6d0a-421a-9ea2-2a884d33e449', 'Claude_Sep', 108.90, true, null),
    ('2efa7910-93bf-4ce0-b11c-b6831b2fc0cf', 'Apimart',     8.82, true,  null),
    ('60078ccc-1a67-4301-8b85-49ab413d835c', 'Apimart',     8.82, true,  null),
    ('d10d88ed-28bb-4552-8563-9b37c2c4dc37', 'CapCut',     18.49, true,  null),
    ('15da804a-5c0e-42ee-a9d6-02ea42a9c580', 'Apimart',     8.98, true,  null),
    -- 2. Mal clasificados
    ('11fe15d1-4167-417a-b381-5921b6a36c2f', 'Meta ads',   86.28, false, v_ads),
    ('82f12d8b-fdce-4bcb-b887-694eab59630b', 'Meta ads',  149.96, false, v_ads),
    ('7e1e1bed-68dd-4851-bf69-c6dcbed3cf02', 'Meta ads',   54.60, false, v_ads),
    ('ab7d2ed0-6c5f-4837-bf6b-4caeb106c546', 'CJ',         50.29, false, v_prod),
    -- 3. Shopify, a su categoría y en la tienda
    ('9550fe1d-8218-4696-ac41-ff4dfadf7b6f', 'Shopify',    32.00, false, v_shop),
    ('d98d07bb-c6cb-43fa-bf8b-8e5048109efa', 'Shopify',    32.00, false, v_shop);

  -- Cada fila tiene que existir tal y como se revisó.
  for v_fila in
    select c.*, m.id as encontrada, m.concepto as concepto_real, m.total_eur
    from _cambios c left join public.movimientos m on m.id = c.id
  loop
    if v_fila.encontrada is null
       or v_fila.concepto_real <> v_fila.concepto
       or v_fila.total_eur <> v_fila.total then
      raise exception 'El movimiento % («%», % €) no está como se revisó. No se aplica nada.',
        v_fila.id, v_fila.concepto, v_fila.total;
    end if;
  end loop;

  -- Es una corrección de los socios, no una edición de uno de ellos: no se
  -- toca updated_at.
  alter table public.movimientos disable trigger set_updated_at;

  update public.movimientos m
     set tienda_id = null
    from _cambios c
   where c.id = m.id and c.a_general;
  get diagnostics v_n = row_count;
  if v_n <> 7 then raise exception 'Se esperaban 7 gastos a General y se movieron %.', v_n; end if;

  update public.movimientos m
     set categoria_id = c.categoria
    from _cambios c
   where c.id = m.id and not c.a_general;
  get diagnostics v_n = row_count;
  if v_n <> 6 then raise exception 'Se esperaban 6 recategorizaciones y se hicieron %.', v_n; end if;

  alter table public.movimientos enable trigger set_updated_at;
end $$;

-- El total de la sociedad no se mueve.
do $$
declare
  a _antes_0020%rowtype;
begin
  select * into a from _antes_0020;
  if a.resumen - 'gasto_ads' is distinct from
       (select to_jsonb(r) - 'gasto_ads' from public.fn_resumen_periodo('2000-01-01', '2100-12-31', null, false) r)
     or a.liquidacion is distinct from public.fn_estado_liquidacion(current_date)
     or a.tesoreria  is distinct from (select to_jsonb(t) from public.fn_tesoreria(current_date) t)
     or a.anticipos  is distinct from (select jsonb_agg(to_jsonb(x) order by x.socio_id) from public.vw_anticipos_socio x) then
    raise exception 'La 0020 cambia el total de la sociedad. No se aplica nada.';
  end if;
end $$;
