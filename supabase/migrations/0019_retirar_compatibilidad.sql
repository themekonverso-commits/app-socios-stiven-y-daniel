-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Retira la compatibilidad con la app anterior a la multi-tienda
--
-- Se aplica SOLO cuando la app nueva está desplegada y verificada en
-- producción. Hasta entonces la 0018 mantenía, para la versión vieja:
--   · la columna movimientos.cuenta_pago (sustituida por medio_pago);
--   · las vistas y funciones sin tienda (vw_resumen_*, vw_gastos_categoria y
--     las firmas antiguas de fn_resumen_periodo, fn_resumen_iva,
--     fn_ventas_registradas, fn_cobros_solapados, fn_registrar_ventas_dia y
--     fn_importar_movimientos);
--   · TheGlowCoSpain como tienda por defecto de lo que se creaba sin tienda;
--   · el ajuste objetivo_mes (ahora vive en cada tienda).
--
-- No cambia ningún importe: solo borra lo que ya nadie usa.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Vistas y firmas antiguas.
drop view if exists public.vw_resumen_diario;
drop view if exists public.vw_resumen_mensual;
drop view if exists public.vw_gastos_categoria;

drop function if exists public.fn_resumen_periodo(date, date);
drop function if exists public.fn_resumen_iva(date, date);
drop function if exists public.fn_ventas_registradas(date, date, text);
drop function if exists public.fn_cobros_solapados(text, date, date, text);
drop function if exists public.fn_registrar_ventas_dia(date, text, numeric, numeric, int, numeric, int, boolean);
drop function if exists public.fn_importar_movimientos(text, text, jsonb, int, int);

-- 2. Sin tienda por defecto: lo que llega sin tienda es de General (y un
--    ingreso sin tienda lo rechaza la restricción movimientos_ingreso_con_tienda).
alter table public.movimientos        alter column tienda_id drop default;
alter table public.cobros_pasarela    alter column tienda_id drop default;
alter table public.importaciones      alter column tienda_id drop default;
alter table public.mapeos_importacion alter column tienda_id drop default;
alter table public.cuentas_activos    alter column tienda_id drop default;
alter table public.notas              alter column tienda_id drop default;

-- 3. El trigger, sin la traducción desde cuenta_pago.
create or replace function public.normalizar_medio_pago()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_socio uuid;
begin
  if new.tienda_id is not null
     and (tg_op = 'INSERT' or new.tienda_id is distinct from old.tienda_id)
     and exists (select 1 from public.tiendas t where t.id = new.tienda_id and t.estado = 'archivada') then
    raise exception 'La tienda está archivada: no admite movimientos nuevos.';
  end if;

  if new.tipo = 'ingreso' then
    new.medio_pago := null;
    if new.metodo_cobro is null and exists (
      select 1 from public.categorias c
       where c.id = new.categoria_id and c.nombre = 'Ventas Shopify'
    ) then
      new.metodo_cobro := 'shopify_payments';
    end if;
    return new;
  end if;

  new.metodo_cobro := null;

  -- Sin medio (importación, inventario de cuentas): se deduce.
  if new.medio_pago is null then
    new.medio_pago := case when new.anticipado_por is not null then 'bolsillo' else 'banco' end;
  end if;

  if new.medio_pago = 'tarjeta_daniel' then
    v_socio := public.fn_socio_tarjeta();
    if v_socio is null then
      raise exception 'No hay ningún socio asignado a la tarjeta (ajuste «limite_aportacion»).';
    end if;
    new.anticipado_por := v_socio;
  elsif new.medio_pago = 'bolsillo' then
    if new.anticipado_por is null then
      raise exception 'Un gasto pagado de bolsillo necesita saber qué socio lo adelantó.';
    end if;
  else
    new.anticipado_por := null;
  end if;

  if tg_op = 'UPDATE' and new.anticipado_por is distinct from old.anticipado_por
     and exists (select 1 from public.reembolso_movimientos rm where rm.movimiento_id = old.id) then
    raise exception
      'Este gasto ya tiene reembolsos aplicados: no se puede cambiar quién lo pagó. '
      'Anula antes el reembolso en /liquidacion.';
  end if;

  return new;
end;
$$;

-- 4. La columna vieja.
alter table public.movimientos drop column if exists cuenta_pago;

-- 5. Los objetivos ya están en cada tienda.
delete from public.ajustes where clave = 'objetivo_mes';
