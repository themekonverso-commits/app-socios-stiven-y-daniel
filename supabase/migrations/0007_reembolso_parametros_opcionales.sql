-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — El método y las notas de un reembolso son opcionales
--
-- Sin DEFAULT, el generador de tipos de Supabase los declaraba obligatorios y
-- la aplicación no podía enviar null. Se declaran opcionales en el origen, que
-- es donde debe estar la verdad, en vez de disimularlo con un cast en
-- TypeScript.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_registrar_reembolso(
  p_socio_id uuid,
  p_fecha    date,
  p_importe  numeric,
  p_metodo   text default null,
  p_notas    text default null,
  p_lineas   jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_reembolso uuid;
  v_linea     jsonb;
  v_suma      numeric := 0;
begin
  if v_actor is null then
    raise exception 'No hay sesión activa.';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array'
     or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Un reembolso necesita al menos un anticipo al que aplicarse.';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_suma := v_suma + coalesce((v_linea ->> 'importe_eur')::numeric, 0);
  end loop;

  v_suma := round(v_suma, 2);

  if round(p_importe, 2) < v_suma then
    raise exception
      'El importe del reembolso (% €) no cubre el desglose (% €).',
      round(p_importe, 2), v_suma;
  end if;

  insert into public.reembolsos (fecha, socio_id, importe_eur, metodo, notas, created_by)
  values (p_fecha, p_socio_id, round(p_importe, 2), p_metodo, p_notas, v_actor)
  returning id into v_reembolso;

  -- El trigger validar_reembolso comprueba, línea a línea, que el anticipo es
  -- de ese socio y que no se le paga más de lo que se le debe.
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    insert into public.reembolso_movimientos (reembolso_id, movimiento_id, importe_eur)
    values (
      v_reembolso,
      (v_linea ->> 'movimiento_id')::uuid,
      round((v_linea ->> 'importe_eur')::numeric, 2)
    );
  end loop;

  return v_reembolso;
end;
$$;

revoke all on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb) from public, anon;
grant execute on function public.fn_registrar_reembolso(uuid, date, numeric, text, text, jsonb) to authenticated;
