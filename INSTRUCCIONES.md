# Lexmonn — Tienda web con catálogo en Google Sheets

Este sitio muestra el catálogo de productos, arma el carrito de compras y
envía el pedido completo por WhatsApp con los datos del comprador.

Ya se creó la hoja de cálculo **"Lexmonn - Catálogo de Productos (Tienda Web)"**
en Google Drive y se compartió como editor con **lexmonn.admon@gmail.com**,
con 14 productos de ejemplo (porta herramientas y herramientas de
construcción) ya cargados con precios de ejemplo. Ábrela desde ese correo en
Google Sheets.

> **Mientras no conectes la hoja:** la página ya muestra un catálogo de
> ejemplo (los mismos 14 productos) directamente, sin necesitar ninguna
> configuración, para que puedas ver cómo se ve y probar el carrito. Ese
> catálogo de ejemplo vive en el archivo `sample-products.js` y deja de
> usarse automáticamente en cuanto configures `SHEET_CSV_URL` en el Paso 2.

> Nota sobre la propiedad: la hoja quedó creada por la cuenta que está
> conectada a este asistente. Si el CEO quiere ser el **propietario** (no solo
> editor), puede hacerlo él mismo: en Google Sheets → botón **Compartir** →
> junto a su correo, cambiar el rol a **"Es propietario"**. Como editor ya
> puede hacer todo lo necesario (agregar productos, cambiar precios, imágenes,
> etc.), así que este paso es opcional.

---

## Para ti (el dueño del negocio): nada cambia

**Sigues editando todo desde la Google Sheet, exactamente igual que
siempre.** Agregas una fila para un producto nuevo, editas una celda para
cambiar un precio, pones `No` en `Activo` para ocultar uno — nunca necesitas
tocar código ni abrir ningún archivo.

Lo único nuevo es que, por detrás, el sitio ahora también genera una
**página propia por cada producto y por cada categoría** (para que la gente
te encuentre en Google buscando el nombre de un producto específico, no solo
"Lexmonn"). Eso lo hace un proceso automático — no es nada que tengas que
operar tú.

### ¿Cuánto tarda en verse un cambio?

| Qué cambiaste | Dónde se ve rápido | Cuándo se ve en todos lados |
|---|---|---|
| Un precio o si un producto está en oferta | En la página de ese producto y en el catálogo (Home): **unos minutos** | — |
| Activar/desactivar un producto (`Activo`) | En el catálogo (Home): unos minutos | Su página individual y el sitemap: en la siguiente actualización automática |
| Un producto **nuevo** (fila nueva) | — | Su propia página (con su URL, para SEO) aparece en la **siguiente actualización automática** (cada 6 horas) |
| Cambiar el **nombre** de un producto | El catálogo lo refleja en minutos | Su página cambia de dirección (URL); la anterior queda con un aviso de "no disponible" en vez de romperse |

### ¿Cómo forzar una actualización inmediata?

Si no quieres esperar la actualización automática (por ejemplo, acabas de
agregar 3 productos nuevos y quieres que ya tengan su página):

1. Ve a la pestaña **Actions** del repositorio en GitHub.
2. Entra al workflow **"Build y deploy a Netlify"**.
3. Clic en **"Run workflow"** → **"Run workflow"** de nuevo para confirmar.
4. En 1-2 minutos el sitio queda actualizado con todo lo nuevo de la Sheet.

Si no tienes acceso a GitHub, pídele a quien te ayudó a configurar esto que
lo haga, o que corra `node build.js` desde su computador y vuelva a subir la
carpeta a Netlify.

---

## Paso 1: Editar productos en la hoja

Columnas de la hoja (no cambies los nombres de las columnas):

| Columna | Qué va aquí |
|---|---|
| `ID` | Un número único por producto (1, 2, 3...) |
| `Nombre` | Nombre del producto |
| `Descripcion` | Descripción corta |
| `Precio` | Solo números, sin puntos ni símbolo. Ej: `180000` |
| `Imagen_URL` | Link directo a la imagen (ver Paso 3) |
| `Categoria` | Se usa para los filtros de la tienda (ver abajo) |
| `Imagenes_Adicionales` | Opcional. Fotos extra para la galería del producto (ver abajo) |
| `Precio_Oferta` | Opcional. Precio de descuento (ver abajo) |
| `Activo` | `Si` para que se muestre en la tienda, `No` para ocultarlo |

### Filtros por categoría

La página muestra automáticamente botones de filtro (Todos + una pastilla por
cada categoría distinta que exista en la columna `Categoria`). No necesitas
tocar código: solo escribe el nombre de categoría que quieras en cada fila y
el filtro aparece solo. Cada categoría también obtiene su propia página (ej.
`/categoria/porta-herramientas.html`) para captar búsquedas como "cinturones
porta herramientas".

Categorías sugeridas para Lexmonn (puedes usar estas o las que prefieras):
- `Porta Herramientas Lexmonn`
- `Herramientas Total`
- `Herramientas Pretul`
- `Herramientas Truper`
- `Herramientas de Ferretería`

### Galería de varias fotos por producto

Al hacer clic en un producto se abre su ficha con toda su información
(dentro de un modal en el catálogo, o directamente si entras a su página
propia). Si solo llenas `Imagen_URL` se muestra esa única foto. Si quieres
varias fotos (como en las tiendas grandes, con miniaturas debajo de la foto
principal), agrega la columna `Imagenes_Adicionales` y pega ahí las URLs de
las fotos extra **separadas por coma**, por ejemplo:

```
https://ejemplo.com/foto2.jpg, https://ejemplo.com/foto3.jpg, https://ejemplo.com/foto4.jpg
```

`Imagen_URL` siempre es la primera foto que se ve; las de
`Imagenes_Adicionales` aparecen después, como miniaturas para hacer clic.

### Poner un producto en descuento

Agrega la columna `Precio_Oferta` a tu hoja. Para poner un producto en
oferta, solo escribe ahí el nuevo precio (más bajo que `Precio`). La página
automáticamente:
- Muestra una insignia roja con el porcentaje de descuento (ej. `-19%`)
- Tacha el precio original y muestra el precio de oferta en rojo
- Usa el precio de oferta en el carrito y en el mensaje de WhatsApp del pedido

Para quitar el descuento, simplemente borra el valor de `Precio_Oferta` (deja
la celda vacía) — el producto vuelve a mostrar su precio normal.

Para agregar un producto nuevo: agrega una fila nueva con esos datos.
Para cambiar precio, descripción o imagen: edita la celda correspondiente.

---

## Paso 2: Publicar la hoja para que la web pueda leerla — YA HECHO ✅

`SHEET_CSV_URL` en `config.js` ya está conectado a tu hoja real
("Lexmonn - Catálogo de Productos (Tienda Web)", compartida con
lexmonn.admon@gmail.com).

Si en algún momento cambias de hoja o necesitas regenerar este link, aquí
queda el procedimiento manual:

1. En Google Sheets, ve a **Archivo → Compartir → Publicar en la Web**.
2. Elige la hoja (ej. "Sheet1") y el formato **Valores separados por comas (.csv)**.
3. Click en **Publicar** y confirma.
4. Copia el link que te da Google (algo como
   `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv`).
5. Abre el archivo `config.js` de este proyecto y pega ese link en:
   ```js
   SHEET_CSV_URL: "PEGA_AQUI_EL_LINK",
   ```

Alternativa si no ves "Publicar en la Web": comparte la hoja como
**"Cualquier persona con el enlace - Lector"** y usa esta URL (reemplaza
`TU_ID_DE_HOJA` por el ID que aparece en la URL de tu hoja):

```
https://docs.google.com/spreadsheets/d/TU_ID_DE_HOJA/export?format=csv
```

---

## Paso 3: Agregar imágenes de los productos

La forma más fácil es subir las fotos a Google Drive y usarlas así:

1. Sube la imagen a Drive.
2. Click derecho → **Compartir** → **Cualquier persona con el enlace**.
3. Copia el ID del archivo desde el link (la parte entre `/d/` y `/view`).
4. En la columna `Imagen_URL` de la hoja, pega este link reemplazando el ID:
   ```
   https://lh3.googleusercontent.com/d/TU_ID_DE_IMAGEN
   ```

También puedes usar cualquier otro link directo a imagen (por ejemplo de tu
propia página, postimg.cc, o un servicio como imgur).

---

## Paso 4: Configurar el número de WhatsApp

En `config.js`:

```js
WHATSAPP_NUMBER: "573015597873", // ejemplo: indicativo país + número, sin +, espacios ni guiones
```

Todos los pedidos armados en la web (desde el catálogo o desde la página de
un producto) llegarán como un mensaje de WhatsApp a ese número.

---

## Paso 5: Cómo funciona el sitio por dentro (para quien lo mantenga)

El sitio combina dos técnicas para que sea rápido, se vea bien en Google, Y
el catálogo se pueda editar sin tocar código:

- **Pre-renderizado (SSG)**: antes de publicar, `build.js` descarga el CSV
  de la Sheet y escribe `index.html`, una página por producto
  (`productos/*.html`) y una por categoría (`categoria/*.html`) con el
  contenido YA escrito adentro. Esto es lo que le permite a Google indexar
  cada producto por separado, con su propio título y descripción.
- **Hidratación en el navegador**: `app.js` sigue haciendo lo que hacía
  antes — vuelve a consultar la Sheet en vivo cada vez que alguien visita el
  sitio, y actualiza los precios en pantalla si cambiaron después del último
  build. Así el SEO no depende de que el build corra seguido, y los precios
  igual se ven frescos.
- Si por algún motivo el build nunca corriera, el sitio **sigue
  funcionando**: `app.js` arma el catálogo completo en el navegador como lo
  hacía originalmente.

Archivos del proyecto:
- `index.html`, `productos/`, `categoria/`, `sitemap.xml` — **generados por
  `build.js`**. No los edites a mano: los vuelve a escribir el próximo build.
- `templates/shell.js` — el header, footer, banner y modales del carrito. Si
  algún día quieres cambiar ese texto o diseño a mano, es este el archivo
  que se edita (no `index.html`).
- `lib/shared.js` y `lib/templates.js` — la lógica de precios/parseo y las
  plantillas de HTML, compartidas entre el navegador y `build.js`.
- `style.css` — estilos.
- `app.js` — carrito, hidratación de precios en vivo, envío por WhatsApp.
- `sample-products.js` — catálogo de **respaldo**, solo se usa si nunca se
  ha conectado ninguna Sheet.
- `config.js` — los 4-5 valores que sí se editan a mano (`SHEET_CSV_URL`,
  `WHATSAPP_NUMBER`, etc.)

### Correr el build a mano

```bash
node build.js
```

Requiere Node.js 18 o más nuevo instalado. No hace falta ningún paquete
adicional (`npm install` no es necesario).

---

## Publicar el sitio en internet

### Automatizado (recomendado, ya configurado en este proyecto)

Un workflow de GitHub Actions (`.github/workflows/build-deploy.yml`) corre
`node build.js` y publica el resultado en Netlify automáticamente:
- Cada 6 horas.
- Cada vez que se hace push a la rama `main`.
- A demanda, desde la pestaña "Actions" en GitHub (botón "Run workflow").

**Configuración inicial (solo una vez, la hace quien tenga acceso técnico):**

1. Crear un repositorio en GitHub y subir esta carpeta:
   ```bash
   git add -A
   git commit -m "Sitio Lexmonn con SEO y build automático"
   git remote add origin https://github.com/TU-USUARIO/lexmonn-pagina-web.git
   git push -u origin main
   ```
2. En el sitio de Netlify (el que ya sirve `lexmonn.com`): **Site
   configuration → General → Site details**, copiar el **Site ID**.
3. En Netlify: **User settings → Applications → Personal access tokens →
   New access token**, copiarlo (solo se muestra una vez).
4. En el repositorio de GitHub: **Settings → Secrets and variables →
   Actions → New repository secret**, crear:
   - `NETLIFY_SITE_ID` con el valor del paso 2.
   - `NETLIFY_AUTH_TOKEN` con el valor del paso 3.
5. Listo — desde ahora el sitio se actualiza solo. El dominio `lexmonn.com`
   no cambia (sigue apuntando al mismo sitio de Netlify).

### Manual (alternativa, sin GitHub)

Sigue siendo un sitio de archivos estáticos, así que también puedes:
1. Correr `node build.js` en tu computador.
2. Arrastrar la carpeta completa a https://app.netlify.com/drop (o a
   GitHub Pages).

Con esta opción, los cambios de la Sheet **no** generan páginas nuevas de
producto/categoría hasta que alguien repita estos dos pasos a mano — por
eso se recomienda la opción automatizada de arriba.

---

## Cómo funciona el carrito

- Se guarda en el navegador del cliente (localStorage): si cierra la pestaña
  y vuelve, no lo pierde. Funciona igual entrando por el catálogo o por la
  página de un producto específico.
- Al hacer clic en "Enviar pedido por WhatsApp" (o en "Pedir por WhatsApp"
  desde la página de un producto) arma un mensaje con la lista de
  productos, cantidades, total y los datos que el cliente escriba, y abre
  WhatsApp con ese mensaje ya redactado.
