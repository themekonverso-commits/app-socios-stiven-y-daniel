-- Tabla comparativa de las fotos de la 0018 (antes / después TheGlowCoSpain / después todas).
select x.metrica,
       max(x.valor) filter (where f.momento = 'antes')          as antes,
       max(x.valor) filter (where f.momento = 'despues_tienda') as despues_theglowcospain,
       max(x.valor) filter (where f.momento = 'despues_todas')  as despues_todas
from _foto_0018 f
cross join lateral (values
  (1,  'Facturación',                    f.datos #>> '{resumen,ingresos}'),
  (2,  'Gastos',                         f.datos #>> '{resumen,gastos}'),
  (3,  'Beneficio',                      f.datos #>> '{resumen,beneficio}'),
  (4,  'Gasto en publicidad',            f.datos #>> '{resumen,gasto_ads}'),
  (5,  'Pedidos',                        f.datos #>> '{resumen,pedidos}'),
  (6,  'IVA repercutido',                f.datos #>> '{iva,iva_repercutido}'),
  (7,  'IVA soportado',                  f.datos #>> '{iva,iva_soportado}'),
  (8,  'Anticipado Daniel',              jsonb_path_query_first(f.datos, '$.anticipos[*] ? (@.socio == "Daniel").anticipado') #>> '{}'),
  (9,  'Reembolsado a Daniel',           jsonb_path_query_first(f.datos, '$.anticipos[*] ? (@.socio == "Daniel").reembolsado') #>> '{}'),
  (10, 'Pendiente con Daniel',           jsonb_path_query_first(f.datos, '$.anticipos[*] ? (@.socio == "Daniel").pendiente') #>> '{}'),
  (11, 'Anticipado Stiven',              jsonb_path_query_first(f.datos, '$.anticipos[*] ? (@.socio == "Stiven").anticipado') #>> '{}'),
  (12, 'Reembolsado a Stiven',           jsonb_path_query_first(f.datos, '$.anticipos[*] ? (@.socio == "Stiven").reembolsado') #>> '{}'),
  (13, 'Pendiente con Stiven',           jsonb_path_query_first(f.datos, '$.anticipos[*] ? (@.socio == "Stiven").pendiente') #>> '{}'),
  (14, 'Anticipos pendientes (total)',   f.datos #>> '{liquidacion,total_pendiente_reembolso}'),
  (15, 'Saldo Banco',                    f.datos #>> '{tesoreria,saldo_banco}'),
  (16, 'Saldo PayPal',                   f.datos #>> '{tesoreria,saldo_paypal}'),
  (17, 'Caja (Banco + PayPal)',          f.datos #>> '{tesoreria,caja_total}'),
  (18, 'Pendiente de cobro',             f.datos #>> '{tesoreria,pendiente_total}'),
  (19, 'Resultado acumulado (liquid.)',  f.datos #>> '{liquidacion,resultado_acumulado}'),
  (20, 'Pérdidas acumuladas',            f.datos #>> '{liquidacion,perdidas_acumuladas}'),
  (21, 'Compensación final socios',      f.datos #>> '{liquidacion_final,importe_a_compensar}'),
  (22, 'Nº movimientos',                 f.datos #>> '{filas,movimientos}'),
  (23, 'Suma total_eur',                 f.datos #>> '{filas,total_eur}'),
  (24, 'Nº cobros',                      f.datos #>> '{filas,cobros}'),
  (25, 'Cierres (huella)',               left(md5((f.datos -> 'cierres')::text), 10)),
  (26, 'Resumen mensual (huella)',       left(md5((f.datos -> 'mensual')::text), 10)),
  (27, 'Resumen diario (huella)',        left(md5((f.datos -> 'diario')::text), 10)),
  (28, 'Gasto por categoría (huella)',   left(md5((f.datos -> 'categorias')::text), 10)),
  (29, 'Conciliación cobros (huella)',   left(md5((f.datos -> 'conciliacion')::text), 10)),
  (30, 'Foto completa (huella)',         left(md5(f.datos::text), 10))
) as x(n, metrica, valor)
group by x.n, x.metrica
order by x.n;
