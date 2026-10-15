-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Gastos pagados con la tarjeta de Daniel desde el 01/10/2026
--
-- Pedido del usuario (2026-10-15): desde el 01/10 la publicidad (Meta Ads) y el
-- coste de producto (CJ) se pagan con la tarjeta, no de bolsillo. Al migrar
-- (0018) quedaron como «bolsillo» y había que cambiarlos uno a uno.
--
-- Pasa a medio_pago = 'tarjeta_daniel' todo gasto de «Publicidad» o «Coste de
-- producto» con fecha del 01/10/2026 a hoy que siga como bolsillo de Daniel,
-- en cualquier tienda. Los que ya están en tarjeta no se tocan.
--
-- Siguen siendo anticipos de Daniel: ni lo anticipado, ni lo reembolsado, ni
-- lo pendiente, ni la liquidación cambian (lo comprueba al final). Solo sube
-- el cupo consumido de la tarjeta.
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table _antes_0021 on commit drop as
select
  public.fn_estado_liquidacion(current_date) as liquidacion,
  (select jsonb_agg(jsonb_build_object('s', a.socio_id, 'ant', a.anticipado, 're', a.reembolsado, 'p', a.pendiente)
                    order by a.socio_id) from public.vw_anticipos_socio a) as anticipos,
  ((public.fn_cupo_tarjeta() ->> 'consumido')::numeric) as cupo;

create temporary table _tarjeta_0021 on commit drop as
select m.id, m.total_eur
from public.movimientos m
join public.categorias c on c.id = m.categoria_id
where m.tipo = 'gasto'
  and c.nombre in ('Publicidad', 'Coste de producto')
  and m.fecha between date '2026-10-01' and current_date
  and m.medio_pago = 'bolsillo'
  and m.anticipado_por = public.fn_socio_tarjeta();

do $$
declare
  v_n int;
begin
  alter table public.movimientos disable trigger set_updated_at;
  update public.movimientos m set medio_pago = 'tarjeta_daniel'
    from _tarjeta_0021 t where t.id = m.id;
  get diagnostics v_n = row_count;
  alter table public.movimientos enable trigger set_updated_at;

  if v_n <> (select count(*) from _tarjeta_0021) then
    raise exception 'Se esperaban % gastos y se marcaron %.', (select count(*) from _tarjeta_0021), v_n;
  end if;
end $$;

do $$
declare
  a _antes_0021%rowtype;
begin
  select * into a from _antes_0021;
  if a.liquidacion is distinct from public.fn_estado_liquidacion(current_date)
     or a.anticipos is distinct from
        (select jsonb_agg(jsonb_build_object('s', x.socio_id, 'ant', x.anticipado, 're', x.reembolsado, 'p', x.pendiente)
                          order by x.socio_id) from public.vw_anticipos_socio x) then
    raise exception 'La 0021 cambia anticipos o liquidación. No se aplica nada.';
  end if;
  if (public.fn_cupo_tarjeta() ->> 'consumido')::numeric - a.cupo
     <> (select coalesce(sum(total_eur), 0) from _tarjeta_0021) then
    raise exception 'El cupo no sube exactamente lo marcado. No se aplica nada.';
  end if;
end $$;
insert into supabase_migrations.schema_migrations (version, name) values ('0021', 'tarjeta_octubre') on conflict (version) do nothing;
select (select count(*) from _tarjeta_0021) marcados, (select sum(total_eur) from _tarjeta_0021) importe, (select cupo from _antes_0021) cupo_antes, fn_cupo_tarjeta() cupo, (select count(*) from movimientos m join categorias c on c.id=m.categoria_id where m.tipo='gasto' and c.nombre in ('Publicidad','Coste de producto') and m.fecha>='2026-10-01' and m.medio_pago='bolsillo') quedan_bolsillo;
