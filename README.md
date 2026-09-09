# Dashboard Socios

Dashboard financiero interno de una tienda Shopify con dropshipping, operada por
**dos socios al 50 %**. Registra ingresos y gastos, muestra KPIs y lleva la
cuenta de cuánto ha adelantado cada socio y cuánto se le debe.

Usuarios: exactamente dos. No hay registro público ni lo habrá.

> **Estado: fase 5, bloque 1 — importación de CSV.**
> Todo lo anterior más la importación de archivos CSV. Los bloques 2 a 4 de la
> fase 5 (exportación para la gestoría, API de Meta, y copias de seguridad /
> auditoría / PWA) quedan pendientes.

---

## Stack

| Pieza | Tecnología |
| --- | --- |
| Framework | Next.js 15 (App Router) + TypeScript estricto |
| Estilos | Tailwind CSS v4 + shadcn/ui |
| Base de datos y auth | Supabase (Postgres + Auth + RLS) |
| Gráficos | Recharts *(se usa a partir de la fase 2)* |
| Formularios | react-hook-form + zod |
| Fechas | date-fns con locale español |
| Despliegue | Vercel |

Interfaz íntegramente en español. Fechas `DD/MM/AAAA`, números en formato
español: `1.234,56 €`.

---

## 1. Instalación en local

Requisitos: **Node.js 20 o superior** (probado con 24.15.0) y npm.

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de entorno a partir de la plantilla
cp .env.local.example .env.local
```

Rellena `.env.local` con los datos de tu proyecto de Supabase
(**Project Settings → API**):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

```bash
# 3. Arrancar
npm run dev
```

La aplicación queda en <http://localhost:3000>. Sin sesión, cualquier ruta
redirige a `/login`.

**No arrancará hasta que ejecutes la migración y crees los usuarios** (pasos 2
y 3). Es lo esperado: no hay forma de entrar sin un usuario creado a mano.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (falla si hay errores de tipos o de ESLint) |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Solo comprobación de tipos |

---

## 2. Base de datos: ejecutar la migración

El esquema completo está en un único archivo:
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
Se ejecuta de una sola pasada y es idempotente (volver a lanzarlo no rompe nada
ni duplica las semillas).

**Forma recomendada — el CLI** (ver la sección 3, con los comandos exactos):

```bash
set -a && . ./.env.local && set +a
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npm run db:push
```

**Alternativa a mano**, si prefieres no usar el CLI: Supabase → **SQL Editor →
New query** → pega el contenido íntegro de `0001_init.sql` → **Run**. Tiene que
ser desde el SQL Editor porque crea un trigger sobre `auth.users`, y eso
necesita el rol `postgres`.

> **Si creaste los usuarios ANTES de aplicar la migración**, no tendrán fila en
> `profiles`: el trigger `on_auth_user_created` todavía no existía cuando se
> insertaron, así que no llegó a dispararse. Se arregla de una vez con:
>
> ```sql
> insert into public.profiles (id, email, nombre, activo, color)
> select u.id, u.email,
>        coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''),
>                 split_part(u.email, '@', 1)),
>        true, '#F2551E'
>   from auth.users u
>   left join public.profiles p on p.id = u.id
>  where p.id is null;
> ```
>
> Los usuarios creados después de la migración sí obtienen su perfil solos.

### Qué crea

**Tablas:** `profiles`, `categorias`, `tipos_cambio`, `movimientos`,
`cuentas_activos`, `notas`, `integraciones`.

**Triggers:**

- `set_updated_at` en las tablas que tienen `updated_at`.
- `calcular_importes` en `movimientos`: fuerza `tasa_cambio = 1` cuando la
  divisa es EUR y calcula `iva_importe`, `total`, `total_eur` y `base_eur`.
  El cliente solo manda `base_imponible`, `iva_tipo`, `divisa` y —si es USD—
  `tasa_cambio`; el resto lo deriva la base de datos, que es la única forma de
  que los importes en euros no se desvíen nunca.
  `iva_importe` y `total` se calculan cuando llegan vacíos (NULL o 0) o cuando
  cambia una de sus entradas; si mandas un importe explícito distinto, se
  respeta, porque una factura real puede redondear de otra forma.
- `on_auth_user_created` en `auth.users`: crea la fila de `profiles`
  automáticamente al dar de alta un usuario.

**Semillas:** 14 categorías de gasto, 2 de ingreso (todas `es_sistema = true`) y
las dos filas de `integraciones` (`meta_ads` y `shopify`, desactivadas).

### Categorías

Las de sistema no se pueden borrar: lo impide la política de `DELETE`.
Las que cree el usuario sí, salvo que tengan movimientos asociados, cosa que
impide la clave foránea `movimientos.categoria_id`.

Crear categorías desde el formulario de movimiento es funcionalidad de la
**fase 1**; el esquema ya está listo para ello.

---

## 3. Migraciones con el CLI de Supabase

El CLI está instalado **como dependencia de desarrollo** del proyecto, no
global: así todo el mundo usa la misma versión y no hace falta instalar nada a
mano. Se invoca con `npx supabase …` o con los scripts de npm.

### Variables que necesita

En `.env.local` (nunca se versiona):

| Variable | Para qué | Dónde se saca |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | identificar el proyecto | Supabase → Project Settings → General |
| `SUPABASE_ACCESS_TOKEN` | autenticar el CLI | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | conexión directa a la base de datos | Project Settings → Database |

Carga el entorno antes de lanzar cualquier comando:

```bash
set -a && . ./.env.local && set +a
```

> `SUPABASE_DB_PASSWORD` no hizo falta para el primer `db push`: el CLI moderno
> enlaza y aplica migraciones con el access token. Déjala configurada de todas
> formas, porque comandos como `db dump` sí la piden.

### Aplicar una migración nueva

```bash
# 1. Crear el archivo de migración (lo numera y fecha el CLI)
npx supabase migration new nombre_descriptivo

# 2. Escribir el SQL en supabase/migrations/<timestamp>_nombre_descriptivo.sql

# 3. Ver qué se va a aplicar SIN aplicarlo
npm run db:dry

# 4. Aplicarlo
npm run db:push

# 5. Regenerar los tipos de TypeScript
npm run db:types
```

### Scripts disponibles

| Script | Qué hace |
| --- | --- |
| `npm run db:link` | Enlaza el repositorio con el proyecto remoto |
| `npm run db:dry` | `db push --dry-run`: enseña qué migraciones faltan sin tocar nada |
| `npm run db:push` | Aplica al remoto las migraciones pendientes |
| `npm run db:diff` | Compara el esquema remoto con las migraciones locales |
| `npm run db:types` | Regenera `src/types/database.ts` desde el esquema remoto |

### Reglas

- **Nunca `supabase db reset` contra el remoto.** Borra todos los datos. Ese
  comando es solo para la base de datos local de desarrollo.
- **Las migraciones no se editan una vez aplicadas.** Si algo está mal, se
  corrige con una migración nueva. El CLI lleva la cuenta de lo aplicado en
  `supabase_migrations.schema_migrations`.
- **Después de cada `db:push`, ejecuta `db:types`.** Si no, los tipos de
  TypeScript se quedan describiendo un esquema que ya no existe.
- Antes de aplicar nada, `npm run db:dry` para ver qué va a pasar.

### Tipos de TypeScript

`src/types/database.ts` lo **genera** el CLI: no se edita a mano.
`src/lib/tipos-db.ts` sí es nuestro: pone nombres en español a esas filas y
afina los campos que en Postgres son `text` con un CHECK (`tipo`, `divisa`),
porque el generador no puede saber que solo admiten dos valores. Los clientes
de Supabase llevan el genérico `Database`, así que las consultas están tipadas
de punta a punta.

---

## 4. Crear los dos usuarios (a mano)

No hay pantalla de registro. Los dos socios se crean desde el panel:

1. Supabase → **Authentication → Users** → botón **Add user** →
   **Create new user**.
2. Rellena **Email** y **Password**.
3. Marca **Auto Confirm User**. Si no lo marcas, el usuario queda pendiente de
   confirmar y el login devolverá un aviso pidiendo confirmarlo desde el panel.
4. Repite para el segundo socio.

El trigger `on_auth_user_created` crea sola la fila en `profiles`, con el
`nombre` sacado de la parte del email anterior a la `@`.

Para poner el nombre bonito y un color distinto por socio (el color se usa en el
avatar de la sidebar), edita la fila en **Table Editor → profiles**, o desde el
SQL Editor:

```sql
update public.profiles
   set nombre = 'Stiven', color = '#F2551E'
 where email = 'socio1@tutienda.com';

update public.profiles
   set nombre = 'Nombre del otro socio', color = '#34C759'
 where email = 'socio2@tutienda.com';
```

> Poner `activo = false` en un perfil le retira el acceso al instante:
> `es_socio_activo()` devuelve `false` y la RLS deja de darle una sola fila.

### Cómo se puede meter el nombre desde el principio

Si creas el usuario por API en lugar de por el panel, pasa el nombre en los
metadatos y el trigger lo recoge:

```json
{ "nombre": "Stiven" }
```

---

## 5. DESACTIVAR EL REGISTRO PÚBLICO ⚠️

**Este paso no es opcional.** Sin él, cualquiera con la URL y la clave anónima
—que viaja al navegador, por diseño— puede crearse una cuenta. Y como las
políticas de RLS dan acceso a *cualquier socio activo*, ese intruso vería toda
la contabilidad.

En Supabase:

1. **Authentication → Sign In / Providers → Email**.
2. Desactiva **Enable signup** (según la versión del panel aparece como
   *Allow new users to sign up* dentro de **Authentication → Settings**).
3. Guarda.
4. Comprueba que ningún otro proveedor (Google, GitHub, magic link…) queda
   habilitado. Solo email + contraseña.

Recomendado además:

- **Authentication → Settings → Enable email confirmations**: si dejas el
  registro cerrado da igual, pero no estorba.
- Revisa periódicamente **Authentication → Users**: deben aparecer exactamente
  dos.

---

## 6. Seguridad: cómo está montado

Lo que protege los datos es la **RLS de Postgres**, no el frontend. Aunque
alguien se saltara la interfaz y llamara a la API directamente, sin ser socio
activo no obtiene ninguna fila.

- **RLS activada en todas las tablas**, sin excepción.
- **Políticas separadas** de `SELECT`, `INSERT`, `UPDATE` y `DELETE` en cada
  tabla. Ninguna es `FOR ALL`.
- Todas exigen `public.es_socio_activo()` y aplican solo al rol
  `authenticated`. **Ninguna política concede acceso a `anon`**, y además se le
  revocan los privilegios de tabla.
- `es_socio_activo()` es `security definer` para poder consultar `profiles` sin
  quedar atrapada en la RLS de esa misma tabla (recursión infinita).
- **Middleware** (`src/middleware.ts`) protege todas las rutas salvo `/login`.
  Valida la sesión con `getUser()`, que verifica el token contra Supabase; no
  con `getSession()`, que solo lee la cookie y es falsificable. Si Supabase no
  responde, falla **cerrado**: te manda a `/login`.
- **Segunda cerradura** en `src/app/(app)/layout.tsx`: vuelve a comprobar la
  sesión en el servidor. Si algún día el matcher del middleware deja un hueco,
  los datos siguen protegidos.
- La redirección tras el login solo acepta rutas internas, para que nadie pueda
  fabricar un enlace que te saque a otro sitio.

### `SUPABASE_SERVICE_ROLE_KEY`

Esta clave **salta la RLS por completo**. Reglas:

- Se usa **solo** dentro de Server Actions o route handlers de servidor.
- **Nunca** con el prefijo `NEXT_PUBLIC_`.
- Si aparece en un archivo con `"use client"`, es un **bug crítico**: hay que
  rotarla en Supabase inmediatamente.

En la fase 0 no hace falta: la aplicación funciona entera con la clave anónima
más la RLS.

### Lo que NO se guarda en base de datos

- **Contraseñas de cuentas de terceros.** `cuentas_activos` es un *inventario*
  de cuentas (Shopify, GoDaddy, Klaviyo…), no un gestor de credenciales. No
  tiene campo de contraseña y no se le debe añadir.
- **Claves de API.** La tabla `integraciones` guarda solo identificadores de
  cuenta en su `config`. Los tokens de Meta Ads y Shopify irán en variables de
  entorno de Vercel.

---

## 7. Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: **Add New → Project** e importa el repositorio.
3. Framework preset: **Next.js** (lo detecta solo). No hace falta tocar los
   comandos de build.
4. **Environment Variables** — añade las dos, marcadas para *Production*,
   *Preview* y *Development*:

   | Nombre | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave anónima / publishable |

5. **Deploy**.
6. Cuando tengas el dominio definitivo, añádelo en Supabase →
   **Authentication → URL Configuration**:
   - *Site URL*: `https://tu-dominio.vercel.app`
   - *Redirect URLs*: `https://tu-dominio.vercel.app/**`

Si más adelante hace falta la `SUPABASE_SERVICE_ROLE_KEY`, se añade en Vercel
**sin** el prefijo `NEXT_PUBLIC_`.

---

## 8. Sistema de diseño

Dark mode fijo. **No hay tema claro** y no se debe añadir uno: la clase `dark`
está fijada en `<html>` y los tokens se declaran una sola vez.

Los tokens viven en [`src/app/globals.css`](src/app/globals.css):

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg-base` | `#0B0B0C` | fondo de la aplicación |
| `--bg-surface` | `#161617` | tarjetas y paneles |
| `--bg-surface-2` | `#1E1E20` | hover, inputs, estados elevados |
| `--border` | `#2A2A2D` | bordes de 1px |
| `--accent` | `#F2551E` | naranja principal |
| `--accent-hover` | `#FF6B38` | hover del naranja |
| `--accent-soft` | `rgba(242,85,30,.12)` | fondos de badge |
| `--text-primary` | `#FAFAFA` | texto principal |
| `--text-secondary` | `#A1A1A6` | texto secundario |
| `--text-muted` | `#6E6E73` | texto apagado |
| `--success` | `#34C759` | variaciones positivas |
| `--danger` | `#FF453A` | variaciones negativas y errores |
| `--warning` | `#FFD60A` | avisos |

Esos tokens de producto son la fuente de verdad; debajo se mapean sobre los
nombres semánticos de shadcn/ui (`--background`, `--card`, `--primary`…) para
que los componentes base hereden la paleta sin escribir un solo color a mano.

**Ojo con un choque de nombres:** shadcn llama `accent` al fondo de *hover* de
menús y botones fantasma, que aquí **no** es el naranja sino
`--bg-surface-2`. El naranja de marca se usa con las utilidades `bg-brand`,
`text-brand` y `bg-brand-soft`.

- **Tipografía:** Inter variable. Las cifras llevan la clase `cifra`
  (`font-variant-numeric: tabular-nums`) para que las columnas de números
  queden alineadas.
- **Radios:** 14px en tarjetas (`rounded-xl`), 10px en botones e inputs
  (`rounded-lg`). La escala deriva de `--radius: 10px`.
- **Sombras:** prácticamente ninguna. La jerarquía la dan el fondo y el borde.
- **Layout:** sidebar fija de 248px (`w-sidebar`) a partir de 768px; por debajo,
  drawer con botón hamburguesa más navegación inferior con 4 destinos.
  Contenido con 32px de padding en escritorio y 16px en móvil.
- **Grid de tarjetas:** 3 columnas en escritorio, 2 en tablet, 1 en móvil.
- **Solo una tarjeta destacada por pantalla**, y siempre la primera.

### `<KpiCard>`

```tsx
import { Wallet } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { formatearEuros } from "@/lib/formato";

<KpiCard
  destacada                        // naranja. Solo una por pantalla
  icono={Wallet}
  titulo="Beneficio neto"
  subtitulo="Ingresos menos gastos"
  valor={formatearEuros(8420.55)}  // el valor llega ya formateado
  variacion={12.4}                 // positiva sube, negativa baja
  etiquetaVariacion="vs. mes anterior"
  enlace={{ href: "/kpis", texto: "Ver detalle" }}
/>
```

### Accesibilidad

- Objetivos táctiles de 44x44px como mínimo en enlaces de navegación, botones
  de icono y campos de formulario.
- Foco siempre visible (`outline` naranja de 2px).
- Enlace «Saltar al contenido principal» para usuarios de teclado.
- El color nunca es el único indicador: las variaciones llevan además signo
  (`+12,4 %`) e icono de tendencia.
- Se respeta `prefers-reduced-motion`.

**Una excepción conocida de contraste:** el texto blanco sobre el naranja
`#F2551E` de la tarjeta destacada da **3,45:1**. Cumple el mínimo de 3:1 para
texto grande (la cifra), pero se queda por debajo de 4,5:1 en el texto pequeño
(título, subtítulo y enlace). Es la consecuencia directa de la combinación
naranja + blanco que pide el diseño. La tarjeta usa un degradado hacia
`#c9400f` (4,97:1 con blanco) que lo compensa en su mitad inferior. Si en algún
momento se quiere cumplir 4,5:1 en toda la tarjeta, basta con oscurecer el fondo
a `#C93C0C` manteniendo `--accent` para botones, barras de gráfico e
indicadores.

---

## 9. Estructura del proyecto

```
src/
├── app/
│   ├── layout.tsx              # raíz: <html class="dark">, Inter, Toaster, Tooltip
│   ├── globals.css             # sistema de diseño (tokens + mapeo shadcn)
│   ├── acciones-auth.ts        # Server Actions: iniciar y cerrar sesión
│   ├── acciones/
│   │   ├── movimientos.ts      # crear, actualizar, borrar, reembolso, venta diaria
│   │   └── categorias.ts       # crear, renombrar, borrar, reordenar
│   ├── api/movimientos/exportar/route.ts   # descarga CSV de los filtros actuales
│   ├── login/                  # /login — fuera del layout de la aplicación
│   └── (app)/                  # todo lo que exige sesión
│       ├── layout.tsx          # shell + panel de movimiento + datos de referencia
│       ├── page.tsx            # / — Dashboard        (fase 2)
│       ├── movimientos/        # /movimientos         ✔ fase 1
│       ├── diario/             # /diario              ✔ fase 1
│       ├── categorias/         # /categorias          ✔ fase 1
│       ├── kpis/               # /kpis                (fase 2)
│       ├── liquidacion/        # /liquidacion         (fase 3)
│       ├── cuentas/            # /cuentas             (fase 4)
│       ├── notas/              # /notas               (fase 4)
│       └── ajustes/            # /ajustes             (fase 5)
├── components/
│   ├── kpi-card.tsx            # tarjeta KPI reutilizable
│   ├── encabezado-pagina.tsx · estado-vacio.tsx · proximamente.tsx
│   ├── campos/                 # segmentado, importe, fecha, combobox creable
│   ├── movimientos/            # panel, formulario, filtros, tabla, acciones…
│   ├── diario/                 # formulario en línea y tabla de 30 días
│   ├── categorias/             # gestor con reordenación
│   ├── layout/                 # sidebar, drawer, nav inferior, menú de usuario
│   └── ui/                     # componentes base de shadcn/ui
├── lib/
│   ├── formato.ts              # euros, fechas y números en formato español
│   ├── dinero.ts               # aritmética de importes y parseo «1.234,56»
│   ├── consultas.ts            # lecturas (server-only), filtros en SQL
│   ├── tipos-db.ts             # tipos de la base de datos
│   ├── navegacion.ts           # definición del menú (única fuente de verdad)
│   ├── esquemas/               # zod: movimiento, venta diaria, categoría, filtros
│   └── supabase/               # clientes de navegador, servidor y middleware
└── middleware.ts               # protección de rutas
```


---

## 10. Fase 1 — cómo funciona el registro de datos

### El formulario de movimiento

Se abre en un panel lateral desde el botón **+ Nuevo movimiento**, presente en
la cabecera de todas las pantallas principales. En móvil ocupa toda la
pantalla. El panel vive en el layout de la aplicación, así que el botón hace lo
mismo desde cualquier ruta.

Está pensado para usarse todos los días, así que:

- El foco entra solo en **Concepto**, que es el primer campo que se escribe.
- La **fecha** viene puesta en hoy, con accesos rápidos a Hoy y Ayer.
- El **concepto** autocompleta con los conceptos ya usados, ordenados por
  frecuencia.
- **Ctrl/Cmd + Intro** guarda y cierra desde cualquier campo. **Esc** cancela, y
  pide confirmación si hay algo escrito sin guardar.
- **Guardar y añadir otro** limpia el concepto y los importes pero mantiene
  tipo, fecha, categoría, divisa y socio, y devuelve el foco a Concepto. Es lo
  que hace que meter diez facturas seguidas no duela.

**Categorías al vuelo.** Si escribes en el combobox un nombre que no existe,
aparece «Crear categoría: «X»». La categoría no se crea al elegirla: se marca
como pendiente y la crea el Server Action al guardar el movimiento. Así, abrir
el formulario y arrepentirse no deja categorías huérfanas. Si ya existe una con
ese nombre y tipo, se reutiliza en lugar de fallar.

**Importes.** Se escribe la base y el sistema calcula IVA y total. El
interruptor «Introducir el total directamente» invierte el cálculo, porque
muchas facturas llegan con el total ya hecho. En ese modo el IVA se obtiene por
diferencia (`total − base`) y no con su propia fórmula, para que
`base + IVA = total` exactamente, sin céntimos descuadrados.

**USD.** Al elegir USD aparecen la tasa, el botón «Usar última tasa» —que lee
la más reciente de `tipos_cambio`— y la conversión en vivo. Al guardar, si esa
fecha aún no tenía tasa registrada, se inserta.

### Dónde se valida

Con zod, en dos sitios y a propósito: `src/lib/esquemas/movimiento.ts` lo
importan tanto el formulario como los Server Actions. La validación del
navegador es comodidad para quien escribe; la que protege es la del servidor,
porque las acciones se pueden invocar sin pasar por el formulario.

### Filtros y URL

Todo el estado de /movimientos vive en la query string
(`src/lib/esquemas/filtros.ts` es la única traducción entre URL y filtros). Una
vista filtrada se puede guardar en marcadores y compartir, y el botón «atrás»
funciona. Los filtros se aplican en la consulta SQL, nunca en el navegador.

La tira de totales suma el conjunto **filtrado completo**, no la página
visible. PostgREST no sabe hacer `SUM` sin una función RPC, así que se traen
solo dos columnas de las filas ya filtradas y se suman en el servidor. Al
volumen de una tienda es instantáneo; si algún día creciera, el siguiente paso
es una función `sum` en Postgres.

### Exportación CSV

`/api/movimientos/exportar` recibe los mismos filtros de la vista, así que lo
que se descarga es exactamente lo que se está viendo. Separador punto y coma,
decimales con coma y **UTF-8 con BOM**: es la única combinación con la que el
Excel español abre el archivo bien de primeras. Las celdas que empiezan por
`=`, `+`, `-` o `@` se escapan con un apóstrofo, porque Excel las ejecutaría
como fórmulas al abrir el archivo.

### Registro diario

`/diario` pinta los 30 días completos, tengan registro o no: los huecos son la
información más útil de la tabla, porque señalan los días que se olvidó
apuntar. Si ya hay ventas registradas para esa fecha, avisa y ofrece
sobrescribir en lugar de duplicar; duplicar las ventas de un día descuadraría
toda la caja.

### Categorías

`/categorias` es donde se limpian las categorías creadas sobre la marcha.
Reordenar funciona arrastrando **y** con botones de subir/bajar: el arrastre
solo no es accesible con teclado ni cómodo en móvil. Las reglas duras las
impone la base de datos (la política de DELETE exige `es_sistema = false` y la
clave foránea bloquea las que tienen movimientos); en la interfaz se comprueban
además antes, para dar un mensaje que se entienda.

### Un detalle de formato que conviene no deshacer

Los formateadores de `src/lib/formato.ts` llevan `useGrouping: "always"`. Por
defecto, la convención española de CLDR **no** pone separador de miles en los
números de cuatro dígitos: `7441,10 €` en vez de `7.441,10 €`. En una tabla de
importes eso rompe la lectura en columna, porque unas cifras llevan punto y
otras no.

### Tipos de la base de datos

`src/lib/tipos-db.ts` está escrito a mano a partir del esquema. Para
regenerarlo desde el proyecto real:

```bash
npx supabase login
npx supabase gen types typescript --project-id <ref> --schema public > src/lib/tipos-db.ts
```

---

## 11. Fase 2 — dashboard y KPIs

### De dónde salen los números

**Todo se calcula sobre `total_eur`, nunca sobre `total`.** `total` está en la
divisa original; sumar euros con dólares da cifras falsas.

Los agregados los hace **Postgres**, no el navegador ni el servidor de Next.
`0003_vistas_kpi.sql` crea:

| Objeto | Qué devuelve |
| --- | --- |
| `vw_resumen_diario` | un día por fila: ingresos, gastos, beneficio, pedidos, gasto_ads, impresiones, clicks |
| `vw_resumen_mensual` | un mes por fila, con margen, ROAS y ticket medio ya calculados |
| `vw_gastos_categoria` | gastos por mes y categoría |
| `fn_resumen_periodo(desde, hasta)` | los totales de un rango en UNA fila |
| `fn_saldo_caja()` | el disponible de hoy |

Las tres vistas llevan **`security_invoker = true`**. Sin eso, una vista se
ejecuta como su propietario y **saltaría la RLS** de las tablas base. Las dos
funciones son `SECURITY INVOKER` (el valor por defecto) por la misma razón.

### La convención del guion

`NULL` significa «no hay dato» y la interfaz lo pinta como **—**. Un `0,00 €`
solo aparece cuando el dato real es cero. La diferencia importa: «no lo sé» y
«es cero» llevan a decisiones distintas.

Por eso no verás nunca `NaN`, `Infinity` ni un ROAS inventado:

- Toda división pasa por `dividir()`, que devuelve `null` si el denominador es 0.
- La variación porcentual es `(actual − anterior) / |anterior|`, y devuelve
  `null` cuando el periodo anterior es 0. Enseñar «+100 %» porque antes no había
  nada sería mentir; se pinta un guion con un tooltip que lo explica.
- El ROAS sin inversión publicitaria es un guion, no un cero.

### El redondeo, que tiene truco

`porcentaje()` redondea **una sola vez, al final**. La primera versión redondeaba
antes el cociente a dos decimales, y 31,41 / 152,41 pasaba de 0,2060… a 0,21:
el margen salía **21,0 %** en vez de **20,6 %**, y encima no coincidía con lo
que calculaba la vista en Postgres. Se detectó porque la fila y el total de la
misma tabla mostraban cifras distintas.

Los porcentajes se imprimen con `formatearPorcentaje()`, no interpolando el
número a pelo: `${valor} %` daba «20.6 %» con punto en una interfaz en español.

### Periodo global

`src/lib/periodo.ts` es la única traducción entre la URL y el periodo. Vive en
la query string, así que una vista se comparte y el botón «atrás» funciona.

La comparación es siempre contra el periodo **inmediatamente anterior de la
misma duración**: comparar un mes en curso contra un mes completo daría caídas
fantasma. La agrupación del eje temporal se elige sola: por día hasta 31, por
semana hasta 90, por mes a partir de ahí.

El **saldo de caja es el único KPI que ignora el selector**: el disponible es el
que es, no depende del rango que estés mirando.

### Gráficos: dos cosas que costaron encontrar

**Sin animaciones de entrada, a propósito.** Recharts anima desde un estado
vacío. Ese primer fotograma en blanco se ve en un panel que se mira de pasada, y
en el anillo llegaba a quedarse así **para siempre**: el hook que leía
`prefers-reduced-motion` se resolvía después del montaje y ese segundo render
reiniciaba la animación dejando los sectores sin dibujar. Se comprobó en el
navegador: los grupos `recharts-shape` existían y estaban vacíos. Renderizar el
estado final elimina el problema de raíz y cumple `prefers-reduced-motion` por
definición.

**El anillo de una sola categoría se dibuja a mano.** Un sector de 360° tiene el
mismo punto de inicio y de fin y Recharts no lo dibuja: con `paddingAngle` salía
una astilla de 30×6 px, y sin él no salía nada (se probaron también los ángulos
explícitos 90 a −270). Para ese caso el anillo es sencillamente un círculo con
borde grueso, así que se dibuja con un `<circle>`: `r` = punto medio entre los
radios, grosor = su diferencia. Con dos o más categorías se usa el `Pie` normal.

Lo demás: fondo transparente, ejes y rejilla en `--text-muted` y `--border`,
rejilla solo horizontal, tooltips con el formato español, altura mínima 240px, y
en móvil menos etiquetas en el eje X en lugar de girarlas en diagonal. Cada
gráfico tiene su estado vacío propio.

### Rendimiento

Los datos se piden en Server Components; solo los gráficos son cliente. Cada
bloque del dashboard tiene su propio `Suspense` con esqueleto, así que las
tarjetas KPI aparecen sin esperar a los gráficos. `revalidate = 60`.

### El ROAS por plataforma es orientativo

La tabla de desglose reparte la facturación **total** entre el gasto de cada
plataforma. Sin atribución real no hay forma de saber qué venta vino de qué
campaña, así que sirve para comparar magnitudes, no para repartir presupuesto.
La interfaz lo dice explícitamente debajo de la tabla.

---

## 12. Fase 3 — liquidación entre socios

Esta es la parte del proyecto que evita discusiones de dinero. Por eso el
criterio es distinto al del resto: **nada importante se deja en manos de la
interfaz**.

### Las reglas del contrato, y dónde vive cada una

| Regla | Qué dice | Dónde se implementa |
| --- | --- | --- |
| R1 | Participación 50/50 en beneficios y pérdidas | `fn_previsualizar_cierre` |
| R2 | Quien adelanta un gasto tiene un crédito contra el negocio | `vw_anticipos_socio` |
| R3 | Orden de prelación de los ingresos | `fn_estado_liquidacion` + la cascada |
| R3.2 | Si no hay fondos, reembolso a prorrata sin preferencias | `fn_prorrata_calculo` |
| R4 | Nadie cobra con anticipos pendientes o pérdidas | `puede_repartir` |
| R5 | Fase Inicial: 3 meses al 100 % de reinversión | `fn_en_fase_inicial` |
| R6 | Límite de aportación de 3.000 € y reunión de continuidad | `ajustes.limite_aportacion` |
| R7 | Liquidación final por mitades del neto | `fn_liquidacion_calculo` |

### Por qué el cálculo está partido en dos capas

Las funciones vienen por parejas:

- `fn_prorrata_calculo(jsonb, numeric)` y `fn_liquidacion_calculo(jsonb)` son
  **puras**: reciben los datos como jsonb y no leen ninguna tabla.
- `fn_prorrata_reembolso(numeric)` y `fn_liquidacion_final()` leen los datos
  reales y delegan en las puras.

Eso permite probar la aritmética del dinero con casos inventados **sin escribir
una sola fila** en una base que contiene deudas reales entre dos personas.

### Lo que la base de datos no deja hacer, pase lo que pase

Las políticas de RLS no protegen de quien tenga la service role key. Aquí se
reparte dinero, así que las reglas duras son **triggers**:

| Trigger | Qué impide |
| --- | --- |
| `validar_reembolso` | Pagar más de lo pendiente de un anticipo, o pagárselo al socio equivocado |
| `validar_total_reembolso` | Que el desglose sume más que la cabecera (diferido al commit) |
| `sincronizar_reembolsado` | Que el flag «saldado» se desincronice de los importes |
| `proteger_cierre` | Modificar o borrar un cierre ya aprobado |

El flag `movimientos.reembolsado` lo lleva la base de datos, no la aplicación:
así un reembolso parcial de 300 € sobre 500 € deja 200 € pendientes y **no**
marca el anticipo como saldado.

### Transaccionalidad

El cliente de Supabase no sabe abrir transacciones. Registrar un reembolso son
varias escrituras, así que se hace con **una sola llamada** a
`fn_registrar_reembolso`: si una línea rebota, no queda ni la cabecera.

### La firma del acta

`fn_aprobar_cierre(p_cierre)` **no recibe el id del firmante**: lo toma de
`auth.uid()` dentro de la base de datos. Ocultar el botón del otro socio en la
interfaz es cortesía; esto es la cerradura. Aunque alguien manipulase la
petición, firmaría por sí mismo.

Con las dos firmas el estado pasa a `aprobado` y el trigger `proteger_cierre`
bloquea cualquier cambio posterior.

### El acta en PDF

No se usa ninguna librería: se imprime con el diálogo del navegador, que ya sabe
guardar en PDF. Las reglas `@media print` de `globals.css` esconden la interfaz
y dejan el acta en negro sobre blanco.

### Tests

`supabase/tests/liquidacion.sql` — 11 casos. Se pega en el SQL Editor y devuelve
un PASA/FALLA por caso.

**No escriben nada.** Los 8 primeros atacan las funciones puras; los 3 que
necesitan filas (triggers de inmutabilidad, reembolso excesivo y reembolso
parcial) van dentro de un `BEGIN … ROLLBACK` y nada llega a confirmarse.

Casos cubiertos: prorrata con fondos insuficientes, exactos y de sobra;
prorrata con un solo socio; el céntimo del redondeo; liquidación final con
anticipos desiguales e iguales; Fase Inicial; cierre aprobado inmutable;
reembolso superior al pendiente; y reembolso parcial.

### Dos detalles que costaron encontrar

- **El céntimo del redondeo.** 1 € entre tres partes da 0,33 × 3 = 0,99. El
  céntimo que falta se asigna al socio con mayor pendiente, para que la suma
  cuadre exacta. Un céntimo descuadrado en una herramienta de reparto destruye
  la confianza en todo lo demás.
- **El trimestre propuesto.** La primera versión proponía cerrar Q4 2024, un
  trimestre anterior a que el negocio existiera, solo porque «no estaba
  cerrado». Ahora la búsqueda se acota con la fecha del saldo inicial, y el
  aviso del semáforo también.

---

## 13. Fase 4 — cuentas, activos y notas

### Esto NO es un gestor de contraseñas

`cuentas_activos` no tiene ningún campo de credenciales **y no debe
añadírsele**. Aquí se registra qué existe, a nombre de quién está y cuánto
cuesta. Las contraseñas viven en un gestor externo. El formulario lo dice
explícitamente bajo el campo de notas, y la exportación CSV no puede filtrar
nada porque no hay nada que filtrar.

Por qué existe la pantalla: dos socios acumulan decenas de cuentas dispersas y
nadie recuerda cuáles hay ni cuánto cuestan. El día que uno salga del proyecto,
o que vendáis la marca, ese inventario **es** el activo.

### El coste mensual se normaliza en SQL

`vw_cuentas_coste` devuelve `coste_mensual_eur` por cuenta:

| Periodicidad | Cómo se normaliza |
| --- | --- |
| mensual | tal cual |
| anual | entre 12 |
| puntual | 0 (no es recurrente) |
| gratuito | 0 |

La conversión USD→EUR usa la última tasa de `tipos_cambio`. Si no hay ninguna,
`hay_tasa` viene en `false` para que la interfaz avise en lugar de mentir con
una cifra inventada. La vista calcula también `dias_para_renovar`, `vencida` y
`renueva_pronto`, así que el estado de cada aviso lo decide Postgres, no React.

### «Registrar pago», la función que conecta la pantalla con el resto

`fn_registrar_pago_cuenta` hace **dos cosas en una sola transacción**:

1. Crea el gasto en `movimientos` con la categoría, la divisa, el importe y el
   titular de la cuenta.
2. Avanza `fecha_renovacion` (+1 mes o +1 año según la periodicidad) y anota
   `ultimo_pago`.

Si el movimiento falla, la cuenta no se toca: nunca queda una renovación
avanzada sin su gasto detrás. El toast confirma las dos cosas, no solo el
gasto.

Si la cuenta no tiene categoría asignada, la función se niega a inventarse
dónde imputar el pago y lo dice.

### Notas: markdown seguro, sin `dangerouslySetInnerHTML`

Se usa `react-markdown`, que construye elementos de React a partir del texto:
**nunca produce HTML crudo**, así que no hay nada que sanear. Es la razón de
elegirlo frente a `marked` + un sanitizador. Los enlaces se abren en pestaña
nueva con `rel="noopener noreferrer"`.

Las casillas `- [ ]` se pueden marcar desde la vista previa: al pulsarlas se
reescribe esa línea del markdown original, sin tocar el resto del formato.

### El autoguardado

Debounce real de 1,5 s: mientras se sigue escribiendo se reinicia el
temporizador, así que **un párrafo entero produce una sola escritura**.
Verificado en el navegador: 163 caracteres seguidos → 1 petición.

Además hay un contador de peticiones (`peticion.current`) que descarta la
respuesta de un guardado anterior que llegue tarde: sin él, una petición lenta
podría pisar el estado de otra más reciente.

`Ctrl/Cmd+S` fuerza el guardado. `Escape` cierra, y avisa si el autoguardado
todavía no ha terminado.

### Etiquetas

La columna `etiqueta` (un texto suelto) se sustituyó por `etiquetas text[]` con
índice **GIN**, y los valores existentes se migraron. Con una sola etiqueta por
nota no se puede clasificar nada. El filtro usa `contains`, que es el operador
que sabe aprovechar ese índice.

### Un detalle de ortografía

`text-transform: capitalize` de CSS pone mayúscula en **cada palabra**, lo que
en español produce «Todos Los Tipos». Se usa `mayusculaInicial()` de
`src/lib/formato.ts` en su lugar. Si añades un desplegable con valores en
minúscula, usa ese helper y no la clase de CSS.

---

## 14. Fase 5, bloque 1 — importación de CSV

Meter las ventas a mano funciona al principio; con volumen deja de funcionar.
`/importar` vuelca un CSV de Shopify o de cualquier plataforma y lo convierte
en movimientos.

### Los tres problemas de un CSV que viene de fuera

Se resuelven en `src/lib/csv.ts`:

| Problema | Cómo se resuelve |
| --- | --- |
| El separador cambia | Detección automática de papaparse (coma, punto y coma, tabulador) |
| La codificación cambia | Se prueba UTF-8; si aparece el carácter de reemplazo, se reintenta con **Windows-1252**, que es lo que exporta el Excel español y la causa de los «Ã±» |
| El formato de fecha y número cambia | `parsearFecha` acepta `dd/mm/aaaa`, ISO y las marcas de tiempo de Shopify; `parsearImporte` acepta «1.234,56», «1,234.56» y «€ 45,00» |

El mapeo se propone solo reconociendo las cabeceras habituales de Shopify
(`Created at`, `Total`, `Currency`, `Name`, `Subtotal`…). Se puede guardar con
un nombre y reutilizar.

### Los cinco pasos

1. **Archivo** — arrastrar o elegir. Máximo 5 MB y 5.000 filas.
2. **Mapeo** — qué columna es cada campo, con las 5 primeras filas a la vista y
   la lista de columnas que se van a ignorar.
3. **Agrupación** — una fila = un movimiento (extractos de gastos), o agrupar
   por día (exports de pedidos: suma los importes de cada fecha y cuenta los
   pedidos, igual que `/diario`).
4. **Revisión** — todas las filas, con los avisos en ámbar y los descartes en
   rojo. Contador arriba y descarga de las rechazadas para corregirlas.
5. **Confirmar** — resumen y botón. Nada se escribe hasta aquí.

### Dónde se valida

En el **servidor**, porque la comprobación que de verdad importa —si una fila ya
existe— necesita consultar la base de datos. Un duplicado es un movimiento con
la misma **fecha, concepto e importe**; se comprueba tanto contra lo ya
registrado como dentro del propio archivo. Es lo que evita el error más caro de
una importación: volcar dos veces el mismo CSV y duplicar la facturación del
mes.

### Todo o nada

`fn_importar_movimientos` es una sola función, y por tanto una sola
transacción. Media importación es peor que ninguna: dejaría movimientos sueltos
imposibles de identificar.

### Deshacer

Cada movimiento importado guarda su `importacion_id`, así que deshacer borra
exactamente lo que esa importación creó, y nada más.

**Solo se puede deshacer si nada de eso está ya comprometido.**
`fn_importacion_bloqueada` comprueba dos cosas:

- que ninguno de sus movimientos caiga dentro del periodo de un cierre
  **aprobado**;
- que ninguno esté aplicado a un reembolso a un socio.

En cualquiera de los dos casos el botón sale bloqueado, con un tooltip que
explica cuál es el motivo. Borrar un movimiento que ya está dentro de un acta
firmada descuadraría la liquidación.

### Verificado

Con un CSV de prueba de 10 filas con errores intencionados: separador y
codificación detectados, mapeo de Shopify automático, **7 listas y 3 con error**
(fecha no reconocida, importe no numérico, divisa desconocida), y la agrupación
por día reduciendo 10 filas a 5 movimientos con las sumas exactas.

---

## 15. Fase 5, bloque 2 — exportación para la gestoría

`/exportar` prepara un trimestre entero en los formatos que suele pedir un
asesor fiscal. Tres descargas y un solo origen de datos.

### El cálculo del IVA vive en Postgres, no en TypeScript

`fn_resumen_iva(desde, hasta)` (migración `0010_resumen_iva.sql`) devuelve el
resumen completo en JSON y `vw_libro_gestoria` devuelve las filas. El Excel, el
PDF y el CSV leen exactamente esas dos cosas, así que **no pueden discrepar
entre ellos**. Si algún día hay que cambiar cómo se agrupa el IVA, se cambia en
un sitio.

Dos decisiones del SQL que conviene no deshacer:

- La cuota de cada fila es `total_eur − base_eur`, **no**
  `round(iva_importe × tasa, 2)`. Con facturas en divisa, redondear el IVA por
  separado y luego sumarlo descuadra contra el total; restando, la fila cuadra
  siempre por construcción.
- Los tipos que no son 21, 10, 4 ni 0 caen en un grupo **«Otros»** en lugar de
  crear una columna nueva por cada rareza. Se avisa en rojo en los tres
  formatos: son operaciones que la gestoría tiene que mirar una a una.

### El cuadre se muestra, nunca se esconde

`fn_cuadre_bloque` es una función **pura** que compara la suma de los subtotales
por tipo con el total general y devuelve las tres diferencias (base, cuota,
total) más un booleano. Esa línea aparece **siempre**: si cuadra lo dice en
verde, y si no cuadra sale en rojo con el importe exacto del descuadre, en la
página, en la hoja de cálculo, en el PDF y en el `LEEME.txt` del ZIP.

No se reparte el descuadre por las filas ni se ajusta el total para que encaje.
Un céntimo de diferencia es señal de que hay un dato mal, y esconderlo lo único
que consigue es que el problema aparezca en el despacho del asesor.

Probado en `supabase/tests/iva.sql`: 6 casos, incluidos una factura en dólares y
un tipo del 5,5 %, con `descuadre base=0.00 cuota=0.00 total=0.00` en los dos
bloques.

### Los tres formatos

| Ruta | Archivo | Qué lleva |
| --- | --- | --- |
| `/api/exportar/libro` | `libro-AAAA-QN.xlsx` | Hojas Ingresos, Gastos y Resumen. Subtotales por tipo de IVA y línea de cuadre. |
| `/api/exportar/iva` | `resumen-iva-AAAA-QN.pdf` | Resumen de IVA repercutido y soportado, con la advertencia en cabecera **y** pie. |
| `/api/exportar/paquete` | `gestoria-AAAA-QN.zip` | Los dos anteriores + `libro.csv` plano + el acta del cierre aprobado + `LEEME.txt`. |

Las tres rutas comparten `src/lib/gestoria/servidor.ts`: comprueban la sesión,
leen `?trimestre=AAAA-QN` y cargan los datos una sola vez, escrito en un sitio
para que las tres exporten lo mismo.

### El Excel escribe números, no texto

Al contrario que el Excel del asistente de EL BOOM, aquí los importes van como
**números de verdad** con formato `#,##0.00 "€"`, de modo que la gestoría puede
sumar columnas. Las fechas van como fecha con formato `dd/mm/yyyy`; el serial se
comprobó a mano dentro del XLSX (03/07/2026 → 46206), así que no hay
desplazamiento por zona horaria.

### Los PDF y el problema de la fuente

Se generan con `pdf-lib` en el servidor. El acta que se imprime desde
`/liquidacion` usa el diálogo del navegador y no produce ningún archivo, así que
para meterla en el ZIP hubo que rehacerla (`acta-pdf.ts`). Los números salen del
cierre guardado, no se recalculan: un cierre aprobado es inmutable.

Helvetica se codifica en WinAnsi, que cubre el español entero (tildes, eñe, «»,
€) pero **lanza una excepción con cualquier cosa fuera de Latin-1**. Como el
acta imprime las notas del cierre y el libro imprime conceptos escritos a mano,
un emoji en una nota tumbaría la descarga completa. `sanearWinAnsi()` sustituye
esos caracteres por `?` y el documento sale igual. Probado con un emoji y con
texto en chino.

### La advertencia

Aparece cuatro veces, a propósito: arriba del todo en `/exportar`, en la
cabecera y en el pie del PDF (recuadro rojo las dos), en la hoja Resumen del
Excel y en el `LEEME.txt` del ZIP. Quien descomprima el paquete y abra solo un
archivo se entera igual de que **no es un modelo oficial**.

### El selector de trimestre

Por defecto se abre en el **último trimestre cerrado**, que es el que se
presenta. La lista va desde el trimestre del saldo inicial hasta el actual, que
se marca como «en curso, sin cerrar». El valor vive en la URL
(`?trimestre=2026-Q2`) para poder recargar y compartir.

`src/lib/gestoria/periodos.ts` hace toda la aritmética con cadenas ISO, sin
`Date`: las zonas horarias ya dieron bastantes disgustos en este proyecto.

### Verificado

Con datos sintéticos en memoria, sin tocar la base de datos: XLSX válido y
legible con las tres hojas, PDF con cabecera `%PDF-1.7`, ZIP con los cinco
archivos, CSV con BOM y punto y coma, serial de fecha correcto, emoji saneado, y
el camino de descuadre pintando en rojo los −3,07 € en los cuatro sitios.
Responsive comprobado a 375, 768 y 1440 px.

---

## 16. Notas de mantenimiento

- **Añadir una ruta al menú:** se toca solo `src/lib/navegacion.ts`. La sidebar,
  el drawer, la barra inferior y el título de la barra superior salen todos de
  ahí.
- **Cambiar el favicon:** la única fuente es `src/app/icon.svg` (el mismo rayo
  de lucide sobre el naranja de marca que usa la sidebar). Después de editarlo
  hay que rehacer los rasterizados:

  ```bash
  node scripts/generar-iconos.mjs
  ```

  Eso regenera `src/app/favicon.ico` (con PNG de 16, 32 y 48 px dentro) y
  `src/app/apple-icon.png` (180 px). Next.js pone las tres etiquetas `<link>`
  solo por que los archivos existan con esos nombres.
- **`npm audit`** avisa de una vulnerabilidad de `postcss` que entra como
  dependencia transitiva de Next.js 15. Corregirla obliga a subir a Next.js 16,
  que es un cambio mayor y sale del stack acordado. Afecta al proceso de build,
  no al runtime del usuario. Se revisará al planificar la subida a Next 16.
- **No añadir un tema claro** sin revisar antes todos los tokens: hoy se
  declaran una sola vez a propósito.
