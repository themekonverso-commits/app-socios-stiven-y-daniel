-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 — La autoría se firma sola: nadie crea a nombre de otro
--
-- La 0012 cerró la edición y el borrado por `created_by`, pero dejó abierta
-- la puerta de atrás: las políticas de INSERT solo exigían `es_socio_activo()`,
-- así que un socio podía dar de alta una fila FIRMADA POR EL OTRO. Y una vez
-- creada, el falsificador ni siquiera podía tocarla, pero el otro socio se
-- encontraba en su nombre un registro que no había hecho.
--
-- Lo detectó el caso 3 de `supabase/tests/permisos.sql`.
--
-- Con la autoría convertida en la base de los permisos, `created_by` deja de
-- ser un dato informativo y pasa a ser la firma. Se fija en la política, no
-- en el código: ninguna vía de escritura puede saltárselo.
--
-- Va en migración aparte porque la 0012 ya está aplicada en el remoto y
-- editarla dejaría el repositorio diciendo una cosa y la base otra.
--
-- Todas las vías de alta de la aplicación ya mandaban el uid de la sesión,
-- así que esto no cambia ningún comportamiento legítimo.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert to authenticated
  with check (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists cuentas_activos_insert on public.cuentas_activos;
create policy cuentas_activos_insert on public.cuentas_activos
  for insert to authenticated
  with check (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists notas_insert on public.notas;
create policy notas_insert on public.notas
  for insert to authenticated
  with check (public.es_socio_activo() and created_by = auth.uid());

drop policy if exists reembolsos_insert on public.reembolsos;
create policy reembolsos_insert on public.reembolsos
  for insert to authenticated
  with check (public.es_socio_activo() and created_by = auth.uid());
