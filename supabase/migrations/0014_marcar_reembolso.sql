-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 — Marcar un reembolso a mano sigue siendo cosa de los dos
--
-- La 0012 dejó protegido el disparador que marca el reembolso cuando se
-- registra uno formal, pero en /movimientos hay además un interruptor manual
-- («Marcar como reembolsado») que la aplicación resolvía con un UPDATE
-- directo sobre `movimientos`. Con la política nueva, ese UPDATE sobre un
-- movimiento del otro socio afectaría a CERO FILAS y la aplicación cantaría
-- éxito igual, porque PostgREST no devuelve error cuando la RLS no ve la fila.
--
-- El marcado de reembolso NO es una edición del movimiento: es parte de la
-- liquidación conjunta. Así que se saca a una función acotada.
--
-- Qué puede y qué no puede esta función:
--   · Solo escribe `reembolsado` y `fecha_reembolso`. Nada más.
--   · Exige sesión y socio activo: la elevación no abre la tabla a nadie de
--     fuera, solo salta la comprobación de autoría.
--   · Solo actúa sobre gastos. Un ingreso no se reembolsa.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_marcar_reembolsado(
  p_movimiento  uuid,
  p_reembolsado boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;

  if not public.es_socio_activo() then
    raise exception 'No tienes permiso para hacer esto.';
  end if;

  select tipo into v_tipo from public.movimientos where id = p_movimiento;

  if v_tipo is null then
    raise exception 'Ese movimiento no existe.';
  end if;

  if v_tipo <> 'gasto' then
    raise exception 'Solo se marcan como reembolsados los gastos.';
  end if;

  update public.movimientos
     set reembolsado     = p_reembolsado,
         fecha_reembolso = case when p_reembolsado then current_date else null end
   where id = p_movimiento;
end;
$$;

comment on function public.fn_marcar_reembolsado(uuid, boolean) is
  'Interruptor manual de reembolso. SECURITY DEFINER a propósito: marcar un '
  'reembolso es parte de la liquidación conjunta, no una edición del '
  'movimiento, y no puede depender de quién lo registró.';

revoke all on function public.fn_marcar_reembolsado(uuid, boolean) from public, anon;
grant execute on function public.fn_marcar_reembolsado(uuid, boolean) to authenticated;
