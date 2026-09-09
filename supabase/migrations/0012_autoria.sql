-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 — Editar y borrar, solo el autor
--
-- Hasta aquí cualquiera de los dos socios podía modificar o eliminar
-- cualquier registro. A partir de ahora:
--
--   · LECTURA  → sin cambios. Los dos lo ven todo. La transparencia es total.
--   · CREACIÓN → sin cambios. Los dos pueden crear.
--   · EDICIÓN y BORRADO → solo el autor, por `created_by`.
--
-- `created_by` NO es `anticipado_por`: uno puede registrar un gasto que
-- adelantó el otro, y ahí manda quien lo registró.
--
-- La cerradura va aquí, en las políticas. Esconder un botón es cortesía.
--
-- SE APLICA A: movimientos, cuentas_activos, notas y reembolsos.
-- NO se aplica a categorias ni ajustes (configuración compartida) ni a
-- cierres (ya tienen doble firma e inmutabilidad propias).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Antes de cerrar: que los procesos compartidos sigan funcionando
--
--    Tres funciones escriben sobre estas tablas por cuenta de quien ejecuta.
--    Con las políticas nuevas, dos de ellas afectarían a filas ajenas y se
--    quedarían en CERO FILAS sin decir nada — que es la peor forma de fallar
--    cuando se reparte dinero. Se arreglan de dos maneras distintas según lo
--    que sea correcto en cada caso.
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 El marcado de reembolso NO es editar el movimiento: es parte de la
--     liquidación conjunta y tiene que seguir funcionando para los dos.
--     La elevación es mínima y está acotada: este disparador solo escribe dos
--     columnas derivadas (`reembolsado` y `fecha_reembolso`) de la fila que le
--     indica el propio reembolso, y no acepta ningún parámetro del usuario.
create or replace function public.sincronizar_flag_reembolsado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movimiento uuid := coalesce(new.movimiento_id, old.movimiento_id);
  v_total      numeric(12, 2);
  v_cubierto   numeric(12, 2);
begin
  select m.total_eur into v_total
  from public.movimientos m where m.id = v_movimiento;

  select coalesce(sum(rm.importe_eur), 0) into v_cubierto
  from public.reembolso_movimientos rm where rm.movimiento_id = v_movimiento;

  update public.movimientos
     set reembolsado = (v_cubierto >= v_total),
         fecha_reembolso = case
           when v_cubierto >= v_total then (
             select max(r.fecha)
             from public.reembolsos r
             join public.reembolso_movimientos rm on rm.reembolso_id = r.id
             where rm.movimiento_id = v_movimiento
           )
           else null
         end
   where id = v_movimiento;

  return null;
end;
$$;

comment on function public.sincronizar_flag_reembolsado() is
  'Mantiene movimientos.reembolsado al día. SECURITY DEFINER a propósito: el '
  'marcado de reembolso es parte de la liquidación conjunta y no es una '
  'edición del movimiento, así que no puede depender de quién lo registró.';


-- 1.2 Registrar el pago de una cuenta tampoco es editar la cuenta: solo
--     avanza `ultimo_pago` y `fecha_renovacion`. La función ya exige sesión,
--     ya pone `created_by` del gasto a partir de auth.uid() y no deja elegir
--     a nombre de quién se registra, así que elevarla no abre ninguna puerta.
alter function public.fn_registrar_pago_cuenta(uuid, date, numeric, uuid)
  security definer;

comment on function public.fn_registrar_pago_cuenta(uuid, date, numeric, uuid) is
  'Crea el gasto y avanza la renovación en una sola transacción. SECURITY '
  'DEFINER a propósito: pagar una cuenta recurrente es una operación '
  'compartida, no una edición del inventario.';


-- 1.3 Deshacer una importación SÍ es borrar movimientos, y ahí la regla nueva
--     se aplica entera: solo su autor. Sin esta comprobación el DELETE se
--     quedaría en cero filas y la importación se daría por deshecha igual.
create or replace function public.fn_deshacer_importacion(p_importacion uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_estado   jsonb;
  v_autor    uuid;
  v_borrados int;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;

  select created_by into v_autor
  from public.importaciones where id = p_importacion;

  if v_autor is null then
    raise exception 'Esa importación no existe.';
  end if;

  if v_autor <> auth.uid() then
    raise exception
      'Solo quien hizo la importación puede deshacerla.';
  end if;

  v_estado := public.fn_importacion_bloqueada(p_importacion);

  if (v_estado ->> 'bloqueada')::boolean then
    raise exception 'No se puede deshacer: %', v_estado ->> 'motivo';
  end if;

  delete from public.movimientos where importacion_id = p_importacion;
  get diagnostics v_borrados = row_count;

  delete from public.importaciones where id = p_importacion;

  return jsonb_build_object('borrados', v_borrados);
end;
$$;


-- 1.4 Anular un reembolso: igual, solo quien lo registró. Antes un DELETE
--     bloqueado por RLS habría devuelto void sin protestar.
create or replace function public.fn_anular_reembolso(p_reembolso uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_autor uuid;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;

  select created_by into v_autor
  from public.reembolsos where id = p_reembolso;

  if v_autor is null then
    raise exception 'Ese reembolso no existe.';
  end if;

  if v_autor <> auth.uid() then
    raise exception 'Solo quien registró el reembolso puede anularlo.';
  end if;

  delete from public.reembolsos where id = p_reembolso;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. La autoría del inventario de cuentas deja de ser opcional
--
--    `created_by` entró en 0008 como nullable. Si ahora la política exige
--    `created_by = auth.uid()`, una fila con null no la podría tocar NADIE.
--    Se le pone valor por defecto y se exige.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.cuentas_activos
  alter column created_by set default auth.uid();

alter table public.cuentas_activos
  alter column created_by set not null;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. Las políticas
--
--    Una por operación, nunca `for all`: así se lee de un vistazo qué puede
--    hacer cada quien. El WITH CHECK repite la condición para que nadie pueda
--    reasignar la autoría de una fila a otra persona por el camino.
-- ───────────────────────────────────────────────────────────────────────────

-- 3.1 movimientos
drop policy if exists movimientos_update on public.movimientos;
create policy movimientos_update on public.movimientos
  for update to authenticated
  using       (public.es_socio_activo() and created_by = auth.uid())
  with check  (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists movimientos_delete on public.movimientos;
create policy movimientos_delete on public.movimientos
  for delete to authenticated
  using (public.es_socio_activo() and created_by = auth.uid());


-- 3.2 cuentas_activos
drop policy if exists cuentas_activos_update on public.cuentas_activos;
create policy cuentas_activos_update on public.cuentas_activos
  for update to authenticated
  using       (public.es_socio_activo() and created_by = auth.uid())
  with check  (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists cuentas_activos_delete on public.cuentas_activos;
create policy cuentas_activos_delete on public.cuentas_activos
  for delete to authenticated
  using (public.es_socio_activo() and created_by = auth.uid());


-- 3.3 notas
drop policy if exists notas_update on public.notas;
create policy notas_update on public.notas
  for update to authenticated
  using       (public.es_socio_activo() and created_by = auth.uid())
  with check  (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists notas_delete on public.notas;
create policy notas_delete on public.notas
  for delete to authenticated
  using (public.es_socio_activo() and created_by = auth.uid());


-- 3.4 reembolsos
drop policy if exists reembolsos_update on public.reembolsos;
create policy reembolsos_update on public.reembolsos
  for update to authenticated
  using       (public.es_socio_activo() and created_by = auth.uid())
  with check  (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists reembolsos_delete on public.reembolsos;
create policy reembolsos_delete on public.reembolsos
  for delete to authenticated
  using (public.es_socio_activo() and created_by = auth.uid());
