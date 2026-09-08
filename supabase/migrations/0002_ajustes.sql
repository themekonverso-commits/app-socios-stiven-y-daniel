-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Ajustes del negocio: saldo inicial y objetivos mensuales
--
-- Una tabla clave/valor en vez de una tabla de columnas fijas: los ajustes van
-- a crecer (objetivos por trimestre, umbrales de alerta…) y así cada añadido es
-- una fila, no una migración con ALTER TABLE.
--
-- El saldo de caja se calcula como:
--   saldo_inicial + suma(ingresos EUR) − suma(gastos EUR)
-- desde la fecha del saldo inicial hasta hoy. Sin ese punto de partida no hay
-- forma de saber el disponible: la aplicación no conoce el banco.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.ajustes (
  clave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz default now()
);

comment on table public.ajustes is
  'Ajustes del negocio en clave/valor. Un ajuste nuevo es una fila, no un ALTER TABLE.';
comment on column public.ajustes.valor is
  'saldo_inicial → {"importe": number, "fecha": "YYYY-MM-DD"} · '
  'objetivo_mes  → {"facturacion": number, "beneficio": number}';

drop trigger if exists set_updated_at on public.ajustes;
create trigger set_updated_at
  before update on public.ajustes
  for each row execute function public.set_updated_at();

-- ── Seguridad: mismas reglas que el resto del esquema ──────────────────────
alter table public.ajustes enable row level security;
revoke all on public.ajustes from anon;

drop policy if exists ajustes_select on public.ajustes;
create policy ajustes_select on public.ajustes
  for select to authenticated
  using (public.es_socio_activo());

drop policy if exists ajustes_insert on public.ajustes;
create policy ajustes_insert on public.ajustes
  for insert to authenticated
  with check (public.es_socio_activo());

drop policy if exists ajustes_update on public.ajustes;
create policy ajustes_update on public.ajustes
  for update to authenticated
  using (public.es_socio_activo())
  with check (public.es_socio_activo());

drop policy if exists ajustes_delete on public.ajustes;
create policy ajustes_delete on public.ajustes
  for delete to authenticated
  using (public.es_socio_activo());

-- ── Semillas ──────────────────────────────────────────────────────────────
insert into public.ajustes (clave, valor) values
  ('saldo_inicial', '{"importe": 0, "fecha": "2026-09-07"}'::jsonb),
  ('objetivo_mes',  '{"facturacion": 0, "beneficio": 0}'::jsonb)
on conflict (clave) do nothing;
