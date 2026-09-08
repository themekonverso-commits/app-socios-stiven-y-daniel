-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — Inventario de cuentas y bloc de notas
--
-- Recordatorio que conviene dejar por escrito: `cuentas_activos` es un
-- INVENTARIO, no un gestor de contraseñas. No tiene ningún campo de
-- credenciales y NO se le debe añadir. Aquí se registra qué existe, a nombre
-- de quién está y cuánto cuesta. Las contraseñas viven en un gestor externo.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. AMPLIACIONES DE cuentas_activos
-- ───────────────────────────────────────────────────────────────────────────

alter table public.cuentas_activos
  add column if not exists categoria_gasto_id uuid references public.categorias (id),
  add column if not exists aviso_dias int not null default 7,
  add column if not exists ultimo_pago date,
  add column if not exists created_by uuid references public.profiles (id);

comment on column public.cuentas_activos.categoria_gasto_id is
  'Categoría a la que se imputa el gasto al pulsar «Registrar pago».';
comment on column public.cuentas_activos.aviso_dias is
  'Días de antelación con los que avisar de la renovación.';
comment on column public.cuentas_activos.ultimo_pago is
  'Fecha del último pago registrado desde la aplicación.';

create index if not exists cuentas_renovacion_idx
  on public.cuentas_activos (fecha_renovacion)
  where estado = 'activa';
create index if not exists cuentas_titular_idx
  on public.cuentas_activos (titular_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 2. AMPLIACIONES DE notas
-- ───────────────────────────────────────────────────────────────────────────

alter table public.notas
  add column if not exists color text default null,
  add column if not exists archivada boolean not null default false,
  add column if not exists etiquetas text[] not null default '{}'::text[];

-- La columna `etiqueta` era un texto suelto. Se migra su contenido al array y
-- se elimina: con una sola etiqueta por nota no se puede clasificar nada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notas' and column_name = 'etiqueta'
  ) then
    update public.notas
       set etiquetas = array[trim(etiqueta)]
     where etiqueta is not null
       and trim(etiqueta) <> ''
       and cardinality(etiquetas) = 0;

    alter table public.notas drop column etiqueta;
  end if;
end $$;

-- GIN: es el índice que sabe responder «¿qué notas llevan esta etiqueta?»
-- sobre un array sin recorrer la tabla entera.
create index if not exists notas_etiquetas_idx
  on public.notas using gin (etiquetas);
create index if not exists notas_archivada_idx
  on public.notas (archivada, fijada, updated_at desc);

comment on column public.notas.etiquetas is
  'Etiquetas libres. Array + índice GIN para poder filtrar por varias a la vez.';
comment on column public.notas.color is
  'Acento opcional de la tarjeta. NULL = sin color.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. VISTA vw_cuentas_coste
--
-- Normaliza el coste a mensual y lo pasa a euros. Se calcula en SQL y no en
-- JavaScript: es la cifra que se suma para saber cuánto se va cada mes en
-- suscripciones, y tiene que salir igual en todas las pantallas.
--
--   mensual  → tal cual
--   anual    → entre 12
--   puntual  → 0 (no es recurrente)
--   gratuito → 0
--
-- La conversión USD→EUR usa la última tasa registrada en tipos_cambio; si no
-- hay ninguna, se deja el importe sin convertir y `tasa_aplicada` lo dice, para
-- que la interfaz pueda avisar en vez de mentir con una cifra inventada.
-- ───────────────────────────────────────────────────────────────────────────

drop view if exists public.vw_cuentas_coste;
create view public.vw_cuentas_coste
with (security_invoker = true) as
with tasa as (
  select tasa_a_eur
  from public.tipos_cambio
  where divisa = 'USD'
  order by fecha desc
  limit 1
)
select
  c.*,
  p.nombre                                as titular_nombre,
  p.color                                 as titular_color,
  cat.nombre                              as categoria_nombre,
  coalesce((select tasa_a_eur from tasa), 1) as tasa_aplicada,
  (select tasa_a_eur from tasa) is not null  as hay_tasa,

  -- Coste en euros, sea cual sea su divisa.
  round(
    coalesce(c.coste, 0)
    * case when c.divisa = 'USD' then coalesce((select tasa_a_eur from tasa), 1) else 1 end
  , 2)                                    as coste_eur,

  -- Coste normalizado a mensual, en euros.
  round(
    case lower(coalesce(c.periodicidad, ''))
      when 'mensual' then coalesce(c.coste, 0)
      when 'anual'   then coalesce(c.coste, 0) / 12.0
      else 0
    end
    * case when c.divisa = 'USD' then coalesce((select tasa_a_eur from tasa), 1) else 1 end
  , 2)                                    as coste_mensual_eur,

  -- Días que faltan para renovar. Negativo = vencida.
  case
    when c.fecha_renovacion is null then null
    else (c.fecha_renovacion - current_date)
  end                                     as dias_para_renovar,

  case
    when c.fecha_renovacion is null or c.estado <> 'activa' then false
    else c.fecha_renovacion < current_date
  end                                     as vencida,

  case
    when c.fecha_renovacion is null or c.estado <> 'activa' then false
    else c.fecha_renovacion >= current_date
     and c.fecha_renovacion <= current_date + coalesce(c.aviso_dias, 7)
  end                                     as renueva_pronto

from public.cuentas_activos c
left join public.profiles p on p.id = c.titular_id
left join public.categorias cat on cat.id = c.categoria_gasto_id;

comment on view public.vw_cuentas_coste is
  'Cuentas con el coste normalizado a mensual y en euros, más el estado de su '
  'renovación. La normalización se hace aquí, nunca en el navegador.';


-- ───────────────────────────────────────────────────────────────────────────
-- 4. REGISTRAR EL PAGO DE UNA CUENTA
--
-- Crea el movimiento Y avanza la renovación en una sola transacción. Si el
-- movimiento falla, la cuenta no se toca: nunca queda una renovación avanzada
-- sin su gasto detrás.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_registrar_pago_cuenta(
  p_cuenta     uuid,
  p_fecha      date default current_date,
  p_importe    numeric default null,
  p_categoria  uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor        uuid := auth.uid();
  v_cuenta       record;
  v_categoria    uuid;
  v_importe      numeric;
  v_tasa         numeric := 1;
  v_movimiento   uuid;
  v_nueva_fecha  date;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  select * into v_cuenta from public.cuentas_activos where id = p_cuenta;
  if v_cuenta.id is null then
    raise exception 'Esa cuenta no existe.';
  end if;

  v_categoria := coalesce(p_categoria, v_cuenta.categoria_gasto_id);
  if v_categoria is null then
    raise exception
      'La cuenta «%» no tiene categoría de gasto asignada: no se sabe dónde imputar el pago.',
      v_cuenta.nombre;
  end if;

  v_importe := coalesce(p_importe, v_cuenta.coste);
  if v_importe is null or v_importe <= 0 then
    raise exception 'La cuenta «%» no tiene un coste con el que registrar el pago.', v_cuenta.nombre;
  end if;

  if coalesce(v_cuenta.divisa, 'EUR') = 'USD' then
    select tasa_a_eur into v_tasa
    from public.tipos_cambio where divisa = 'USD'
    order by fecha desc limit 1;
    v_tasa := coalesce(v_tasa, 1);
  end if;

  -- El gasto se registra sin desglose de IVA: una suscripción se imputa por su
  -- importe, y el desglose fiscal lo hace la gestoría.
  insert into public.movimientos (
    tipo, fecha, concepto, categoria_id, divisa,
    base_imponible, iva_tipo, iva_importe, total,
    tasa_cambio, total_eur, base_eur,
    anticipado_por, notas, created_by
  )
  values (
    'gasto', p_fecha, v_cuenta.nombre, v_categoria, coalesce(v_cuenta.divisa, 'EUR'),
    v_importe, 0, 0, v_importe,
    v_tasa, round(v_importe * v_tasa, 2), round(v_importe * v_tasa, 2),
    v_cuenta.titular_id,
    'Pago registrado desde el inventario de cuentas.',
    v_actor
  )
  returning id into v_movimiento;

  -- La renovación avanza según la periodicidad. Se parte de la fecha que ya
  -- tenía para no perder el día del mes; si no había, se cuenta desde el pago.
  v_nueva_fecha := case lower(coalesce(v_cuenta.periodicidad, ''))
    when 'mensual' then coalesce(v_cuenta.fecha_renovacion, p_fecha) + interval '1 month'
    when 'anual'   then coalesce(v_cuenta.fecha_renovacion, p_fecha) + interval '1 year'
    else v_cuenta.fecha_renovacion
  end;

  update public.cuentas_activos
     set ultimo_pago = p_fecha,
         fecha_renovacion = v_nueva_fecha
   where id = p_cuenta;

  return jsonb_build_object(
    'movimiento_id',        v_movimiento,
    'ultimo_pago',          p_fecha,
    'fecha_renovacion',     v_nueva_fecha,
    'importe',              round(v_importe, 2),
    'importe_eur',          round(v_importe * v_tasa, 2),
    'periodicidad',         v_cuenta.periodicidad,
    'renovacion_avanzada',  (v_nueva_fecha is distinct from v_cuenta.fecha_renovacion)
  );
end;
$$;

comment on function public.fn_registrar_pago_cuenta(uuid, date, numeric, uuid) is
  'Crea el gasto y avanza la renovación en una sola transacción.';


-- ───────────────────────────────────────────────────────────────────────────
-- 5. SEGURIDAD — se revisan las políticas tras los cambios
-- ───────────────────────────────────────────────────────────────────────────

-- Las tablas ya tenían RLS desde 0001; se reafirma por si acaso.
alter table public.cuentas_activos enable row level security;
alter table public.notas           enable row level security;

revoke all on public.cuentas_activos from anon;
revoke all on public.notas           from anon;
revoke all on public.vw_cuentas_coste from anon;
grant select on public.vw_cuentas_coste to authenticated;

revoke all on function public.fn_registrar_pago_cuenta(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.fn_registrar_pago_cuenta(uuid, date, numeric, uuid) to authenticated;
