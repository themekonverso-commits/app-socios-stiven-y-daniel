-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Gastos pagados con la tarjeta de Daniel desde el 01/10/2026
--
-- Decisión de los socios (2026-10-14): desde el 01/10 la tarjeta cubre la
-- publicidad y el producto. Pasan a medio_pago = 'tarjeta_daniel' los 22
-- gastos de Daniel en Publicidad y Coste de producto del 01/10 al 14/10
-- (13 de Meta, 9 de CJ, 1.270,00 €). Ninguno de los 3 «Meta ads» mal
-- clasificados (0020) es posterior al 01/10.
--
-- Siguen siendo anticipos de Daniel: ni lo anticipado, ni lo reembolsado, ni
-- lo pendiente, ni la liquidación cambian. Solo sube el cupo consumido de la
-- tarjeta. Por id, con el importe esperado; si algo no cuadra, no se aplica.
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table _antes_0021 on commit drop as
select
  public.fn_estado_liquidacion(current_date) as liquidacion,
  (select jsonb_agg(jsonb_build_object('s', a.socio_id, 'ant', a.anticipado, 're', a.reembolsado, 'p', a.pendiente)
                    order by a.socio_id) from public.vw_anticipos_socio a) as anticipos,
  ((public.fn_cupo_tarjeta() ->> 'consumido')::numeric) as cupo;

do $$
declare
  v_socio uuid := public.fn_socio_tarjeta();
  v_fila  record;
  v_n     int;
begin
  create temporary table _tarjeta (id uuid primary key, total numeric) on commit drop;
  insert into _tarjeta values
    ('09789809-ae02-4c8f-a355-375583fc2bc8',  57.84),  -- 01/10 Meta ads
    ('9814a5bd-1829-473a-9175-1d394ff0ab25',  14.40),  -- 01/10 CJ
    ('60ffc7e7-856b-47b9-8f26-f6917105bb88',  38.25),  -- 02/10 Meta ads
    ('020f4d5b-611e-4b5d-a91b-f8b8d0ecaaab',  14.46),  -- 02/10 CJ
    ('73e586a2-379e-4de5-8fe6-f08d420ebb5d',  24.37),  -- 04/10 Meta ads
    ('ee9a7a9f-e598-4ec9-96af-ebbc7da6f049', 107.28),  -- 04/10 Meta ads
    ('50973d50-ec27-4283-858c-50cd5ad7e623',  34.42),  -- 04/10 CJ
    ('283e4b32-ed69-4a37-b907-ff152125efe1',  70.01),  -- 05/10 Meta ads
    ('1abf3099-57d7-47a5-8df2-a7d221b7b5ec',  64.95),  -- 05/10 CJ
    ('fc9bb317-b2f5-4492-9389-01ab73adb9c7',  47.59),  -- 06/10 Meta ads
    ('3414d74c-2fa8-46ab-98f8-e626bdfb9c62',  39.62),  -- 06/10 CJ
    ('765b98e2-f39f-4eff-9193-8efd09d25bec',  40.64),  -- 08/10 Meta ads
    ('36c83aa9-4d68-4f95-a1a5-184c1e2fbb41', 168.77),  -- 08/10 Meta ads
    ('22bdc444-9019-4eb9-ace9-236211960c05', 118.91),  -- 09/10 Meta ads
    ('8230985e-c892-4169-9bdc-efee8dc78db7',  25.24),  -- 09/10 CJ
    ('48391658-c35a-4bfe-8d88-21325c212263',  25.23),  -- 09/10 CJ
    ('997f9b83-bc89-4667-af50-8fda916d06da',  84.37),  -- 10/10 Meta ads
    ('f3843e81-3b1d-4dc7-a1ee-a98bb20c20a5',  68.82),  -- 10/10 CJ
    ('e4f31584-1a7a-44d3-85ba-a17ea68eba46', 113.01),  -- 11/10 Meta ads
    ('9ca728db-41ff-476f-8300-23c187602269',  44.54),  -- 12/10 Meta ads
    ('26e348ca-2c29-4e75-bcfe-f9b38149a36f',  29.13),  -- 12/10 CJ
    ('8f352eef-dc73-4604-9d13-a3dedb5cf8ff',  38.15);  -- 14/10 Meta ads

  for v_fila in
    select t.*, m.id as encontrada, m.total_eur, m.tipo, m.medio_pago, m.anticipado_por
    from _tarjeta t left join public.movimientos m on m.id = t.id
  loop
    if v_fila.encontrada is null or v_fila.total_eur <> v_fila.total or v_fila.tipo <> 'gasto'
       or v_fila.anticipado_por is distinct from v_socio
       or v_fila.medio_pago not in ('bolsillo', 'tarjeta_daniel') then
      raise exception 'El movimiento % (% €) no está como se revisó. No se aplica nada.', v_fila.id, v_fila.total;
    end if;
  end loop;

  alter table public.movimientos disable trigger set_updated_at;
  update public.movimientos m set medio_pago = 'tarjeta_daniel'
    from _tarjeta t where t.id = m.id;
  get diagnostics v_n = row_count;
  alter table public.movimientos enable trigger set_updated_at;

  if v_n <> 22 then raise exception 'Se esperaban 22 gastos y se marcaron %.', v_n; end if;
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
  if (public.fn_cupo_tarjeta() ->> 'consumido')::numeric - a.cupo <> 1270.00 then
    raise exception 'El cupo no sube exactamente 1.270,00 €. No se aplica nada.';
  end if;
end $$;
