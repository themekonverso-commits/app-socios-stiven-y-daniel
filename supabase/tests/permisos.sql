-- ═══════════════════════════════════════════════════════════════════════════
-- Tests de permisos por autoría (migración 0012)
--
-- CÓMO EJECUTARLOS
--   Pega el archivo entero en el SQL Editor de Supabase y pulsa Run. Devuelve
--   una tabla con un PASA/FALLA por caso.
--
-- NO ESCRIBE NADA EN LA BASE DE DATOS.
--   Todo va dentro de un BEGIN … ROLLBACK. La tabla de resultados es
--   TEMPORARY y muere con la transacción.
--
-- CÓMO SE SUPLANTA A CADA SOCIO
--   `set local role authenticated` deja de ser superusuario —el dueño de la
--   tabla se salta la RLS, así que sin esto los tests pasarían siempre— y
--   `request.jwt.claims` es de donde auth.uid() saca el uid. Es la misma
--   sesión que tendría el socio desde el navegador.
--
-- POR QUÉ SE MIRAN FILAS AFECTADAS Y NO EXCEPCIONES
--   La RLS no lanza error al bloquear un UPDATE o un DELETE: simplemente no
--   ve la fila y afecta a CERO. Ese silencio es justo lo que hay que
--   comprobar, porque es lo que llegaría a la aplicación.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _resultados (
  n        int,
  caso     text,
  esperado text,
  obtenido text,
  ok       boolean
) on commit drop;

-- Los dos socios y una categoría cualquiera, en una tabla temporal para no
-- repetir la consulta en cada bloque.
create temporary table _ctx (
  socio_a   uuid,
  socio_b   uuid,
  nombre_a  text,
  nombre_b  text,
  categoria uuid,
  mov_a     uuid,
  mov_b     uuid,
  cuenta_a  uuid,
  nota_a    uuid
) on commit drop;

insert into _ctx (socio_a, socio_b, nombre_a, nombre_b, categoria)
select
  (array_agg(p.id order by p.nombre))[1],
  (array_agg(p.id order by p.nombre))[2],
  (array_agg(p.nombre order by p.nombre))[1],
  (array_agg(p.nombre order by p.nombre))[2],
  (select id from public.categorias where tipo = 'gasto' limit 1)
from public.profiles p
where p.activo = true;


-- ───────────────────────────────────────────────────────────────────────────
-- Utilidad: ponerse en la piel de un socio
-- ───────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.suplantar(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.volver()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 1 y 2 — CREACIÓN: los dos socios pueden crear
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c       _ctx%rowtype;
  v_id    uuid;
  v_fallo text;
begin
  select * into c from _ctx;

  -- Socio A crea su movimiento.
  begin
    perform pg_temp.suplantar(c.socio_a);
    insert into public.movimientos (
      tipo, fecha, concepto, categoria_id, divisa,
      base_imponible, iva_tipo, iva_importe, total,
      tasa_cambio, total_eur, base_eur, anticipado_por, created_by)
    values ('gasto', '1991-01-01', 'TEST de A', c.categoria, 'EUR',
            100, 0, 0, 100, 1, 100, 100, c.socio_a, c.socio_a)
    returning id into v_id;
    perform pg_temp.volver();
  exception when others then
    v_fallo := sqlerrm;
    perform pg_temp.volver();
  end;

  update _ctx set mov_a = v_id;

  insert into _resultados values (
    1, c.nombre_a || ' puede CREAR un movimiento',
    'creado', coalesce(v_fallo, 'creado'), v_id is not null);

  -- Socio B crea el suyo.
  v_id := null; v_fallo := null;
  begin
    perform pg_temp.suplantar(c.socio_b);
    insert into public.movimientos (
      tipo, fecha, concepto, categoria_id, divisa,
      base_imponible, iva_tipo, iva_importe, total,
      tasa_cambio, total_eur, base_eur, created_by)
    values ('gasto', '1991-01-02', 'TEST de B', c.categoria, 'EUR',
            200, 0, 0, 200, 1, 200, 200, c.socio_b)
    returning id into v_id;
    perform pg_temp.volver();
  exception when others then
    v_fallo := sqlerrm;
    perform pg_temp.volver();
  end;

  update _ctx set mov_b = v_id;

  insert into _resultados values (
    2, c.nombre_b || ' puede CREAR un movimiento',
    'creado', coalesce(v_fallo, 'creado'), v_id is not null);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3 — Nadie puede crear un movimiento a nombre del otro
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c       _ctx%rowtype;
  v_ok    boolean := false;
  v_error text;
begin
  select * into c from _ctx;

  begin
    perform pg_temp.suplantar(c.socio_a);
    insert into public.movimientos (
      tipo, fecha, concepto, categoria_id, divisa,
      base_imponible, iva_tipo, iva_importe, total,
      tasa_cambio, total_eur, base_eur, created_by)
    values ('gasto', '1991-01-03', 'TEST suplantacion', c.categoria, 'EUR',
            50, 0, 0, 50, 1, 50, 50, c.socio_b);
    perform pg_temp.volver();
  exception when others then
    v_ok := true;
    v_error := sqlerrm;
    perform pg_temp.volver();
  end;

  insert into _resultados values (
    3, c.nombre_a || ' NO puede crear un movimiento firmado por ' || c.nombre_b,
    'rechazado', coalesce(v_error, 'SE COLÓ'), v_ok);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4 y 5 — LECTURA: los dos lo ven todo
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c        _ctx%rowtype;
  v_a      int;
  v_b      int;
  v_total  int;
begin
  select * into c from _ctx;

  perform pg_temp.volver();
  select count(*) into v_total from public.movimientos;

  perform pg_temp.suplantar(c.socio_a);
  select count(*) into v_a from public.movimientos;
  perform pg_temp.volver();

  perform pg_temp.suplantar(c.socio_b);
  select count(*) into v_b from public.movimientos;
  perform pg_temp.volver();

  insert into _resultados values (
    4, c.nombre_a || ' LEE todos los movimientos, no solo los suyos',
    v_total || ' filas', v_a || ' filas', v_a = v_total);

  insert into _resultados values (
    5, c.nombre_b || ' LEE todos los movimientos, no solo los suyos',
    v_total || ' filas', v_b || ' filas', v_b = v_total);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6 a 9 — EDICIÓN y BORRADO de movimientos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c      _ctx%rowtype;
  v_n    int;
begin
  select * into c from _ctx;

  -- 6. Sobre lo propio, sí.
  perform pg_temp.suplantar(c.socio_a);
  update public.movimientos set concepto = 'TEST de A (editado)'
   where id = c.mov_a;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    6, c.nombre_a || ' SÍ puede editar su propio movimiento',
    '1 fila afectada', v_n || ' filas afectadas', v_n = 1);

  -- 7. Sobre lo ajeno, no. Y sin excepción: cero filas, en silencio.
  perform pg_temp.suplantar(c.socio_a);
  update public.movimientos set concepto = 'TEST secuestrado'
   where id = c.mov_b;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    7, c.nombre_a || ' NO puede editar el movimiento de ' || c.nombre_b,
    '0 filas afectadas', v_n || ' filas afectadas', v_n = 0);

  -- 8. Borrar lo ajeno, tampoco.
  perform pg_temp.suplantar(c.socio_a);
  delete from public.movimientos where id = c.mov_b;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    8, c.nombre_a || ' NO puede borrar el movimiento de ' || c.nombre_b,
    '0 filas afectadas', v_n || ' filas afectadas', v_n = 0);

  -- 9. Y el movimiento de B sigue ahí, intacto.
  perform pg_temp.volver();
  select count(*) into v_n
  from public.movimientos
  where id = c.mov_b and concepto = 'TEST de B';

  insert into _resultados values (
    9, 'El movimiento de ' || c.nombre_b || ' sigue intacto tras los intentos',
    'sigue', case when v_n = 1 then 'sigue' else 'ALTERADO O BORRADO' end,
    v_n = 1);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 10 — No se puede robar la autoría de una fila propia
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c       _ctx%rowtype;
  v_ok    boolean := false;
  v_n     int := -1;
  v_error text;
begin
  select * into c from _ctx;

  begin
    perform pg_temp.suplantar(c.socio_a);
    update public.movimientos set created_by = c.socio_b where id = c.mov_a;
    get diagnostics v_n = row_count;
    v_ok := (v_n = 0);
    perform pg_temp.volver();
  exception when others then
    v_ok := true;
    v_error := sqlerrm;
    perform pg_temp.volver();
  end;

  insert into _resultados values (
    10, c.nombre_a || ' NO puede reasignar la autoría de su movimiento a ' || c.nombre_b,
    'bloqueado', coalesce(v_error, v_n || ' filas afectadas'), v_ok);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 11 a 13 — cuentas_activos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c    _ctx%rowtype;
  v_id uuid;
  v_n  int;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  insert into public.cuentas_activos (nombre, tipo, created_by)
  values ('TEST cuenta de A', 'servicio', c.socio_a)
  returning id into v_id;
  perform pg_temp.volver();

  update _ctx set cuenta_a = v_id;

  insert into _resultados values (
    11, c.nombre_a || ' puede crear una cuenta', 'creada',
    case when v_id is null then 'no creada' else 'creada' end, v_id is not null);

  perform pg_temp.suplantar(c.socio_b);
  update public.cuentas_activos set nombre = 'TEST secuestrada' where id = v_id;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    12, c.nombre_b || ' NO puede editar la cuenta de ' || c.nombre_a,
    '0 filas afectadas', v_n || ' filas afectadas', v_n = 0);

  perform pg_temp.suplantar(c.socio_b);
  delete from public.cuentas_activos where id = v_id;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    13, c.nombre_b || ' NO puede borrar la cuenta de ' || c.nombre_a,
    '0 filas afectadas', v_n || ' filas afectadas', v_n = 0);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 14 a 16 — notas
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c    _ctx%rowtype;
  v_id uuid;
  v_n  int;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_a);
  insert into public.notas (titulo, contenido, etiquetas, created_by)
  values ('TEST nota de A', 'contenido', '{}', c.socio_a)
  returning id into v_id;
  perform pg_temp.volver();

  update _ctx set nota_a = v_id;

  insert into _resultados values (
    14, c.nombre_a || ' puede crear una nota', 'creada',
    case when v_id is null then 'no creada' else 'creada' end, v_id is not null);

  perform pg_temp.suplantar(c.socio_b);
  update public.notas set titulo = 'TEST secuestrada' where id = v_id;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    15, c.nombre_b || ' NO puede editar la nota de ' || c.nombre_a,
    '0 filas afectadas', v_n || ' filas afectadas', v_n = 0);

  perform pg_temp.suplantar(c.socio_b);
  delete from public.notas where id = v_id;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    16, c.nombre_b || ' NO puede borrar la nota de ' || c.nombre_a,
    '0 filas afectadas', v_n || ' filas afectadas', v_n = 0);

  -- Y la lectura de notas sigue siendo compartida.
  perform pg_temp.suplantar(c.socio_b);
  select count(*) into v_n from public.notas where id = v_id;
  perform pg_temp.volver();

  insert into _resultados values (
    17, c.nombre_b || ' SÍ puede leer la nota de ' || c.nombre_a,
    '1 fila visible', v_n || ' filas visibles', v_n = 1);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 18 — El marcado de reembolso sigue funcionando entre socios
--
--      Es la excepción explícita: B registra un reembolso que cubre un
--      movimiento de A, y el disparador tiene que poder marcar ese
--      movimiento aunque no sea suyo.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c           _ctx%rowtype;
  v_reembolso uuid;
  v_flag      boolean;
  v_error     text;
begin
  select * into c from _ctx;

  begin
    perform pg_temp.suplantar(c.socio_b);

    insert into public.reembolsos (fecha, socio_id, importe_eur, created_by)
    values ('1991-02-01', c.socio_a, 100, c.socio_b)
    returning id into v_reembolso;

    insert into public.reembolso_movimientos (reembolso_id, movimiento_id, importe_eur)
    values (v_reembolso, c.mov_a, 100);

    perform pg_temp.volver();
  exception when others then
    v_error := sqlerrm;
    perform pg_temp.volver();
  end;

  select reembolsado into v_flag from public.movimientos where id = c.mov_a;

  insert into _resultados values (
    18,
    c.nombre_b || ' marca como reembolsado un movimiento de ' || c.nombre_a,
    'reembolsado=true',
    coalesce(v_error, 'reembolsado=' || coalesce(v_flag::text, 'null')),
    v_flag is true);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 19 — Pero anular ese reembolso solo puede hacerlo quien lo registró
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c           _ctx%rowtype;
  v_reembolso uuid;
  v_ok        boolean := false;
  v_error     text;
begin
  select * into c from _ctx;

  select id into v_reembolso
  from public.reembolsos where created_by = c.socio_b limit 1;

  begin
    perform pg_temp.suplantar(c.socio_a);
    perform public.fn_anular_reembolso(v_reembolso);
    perform pg_temp.volver();
  exception when others then
    v_ok := true;
    v_error := sqlerrm;
    perform pg_temp.volver();
  end;

  insert into _resultados values (
    19,
    c.nombre_a || ' NO puede anular un reembolso registrado por ' || c.nombre_b,
    'lanza excepción', coalesce(v_error, 'SE COLÓ'), v_ok);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 20 — La configuración compartida sigue siendo de los dos
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  c   _ctx%rowtype;
  v_n int;
begin
  select * into c from _ctx;

  perform pg_temp.suplantar(c.socio_b);
  update public.categorias set orden = orden
   where id = c.categoria;
  get diagnostics v_n = row_count;
  perform pg_temp.volver();

  insert into _resultados values (
    20, 'Las categorías siguen siendo editables por cualquiera de los dos',
    '1 fila afectada', v_n || ' filas afectadas', v_n = 1);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- RESULTADOS
-- ───────────────────────────────────────────────────────────────────────────

select
  n,
  case when ok then 'PASA' else 'FALLA' end as resultado,
  caso,
  esperado,
  obtenido
from _resultados
order by n;

rollback;
