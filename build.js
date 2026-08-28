#!/usr/bin/env node
// ============================================================
// LEXMONN - Script de build (SSG)
//
// Lee el catálogo real desde la Google Sheet (SHEET_CSV_URL en
// config.js) y genera:
//   - index.html                    (catálogo completo, pre-renderizado)
//   - productos/<slug>.html         (una página por producto activo)
//   - categoria/<slug>.html         (una página por categoría)
//   - sitemap.xml                   (home + productos + categorías)
//
// Correr con:  node build.js
//
// No requiere que el cliente toque nada: sigue editando todo desde
// la Google Sheet exactamente igual que antes. Este script solo lee
// esa hoja y escribe los archivos HTML antes de publicar el sitio.
// ============================================================

const fs = require("fs");
const path = require("path");

const Shared = require("./lib/shared.js");
const Templates = require("./lib/templates.js");
const Shell = require("./templates/shell.js");
const CONFIG = require("./config.js");

const ROOT = __dirname;
const SITE_URL = Shell.SITE_URL;

function writeFile(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

async function fetchCsv(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el CSV de Google Sheets`);
  return res.text();
}

function getAllCategories(products) {
  const seen = [];
  products.forEach((p) => {
    const cat = p.categoria || "Sin categoría";
    if (!seen.includes(cat)) seen.push(cat);
  });
  return seen;
}

function renderCategoryFilterPillsHtml(allCategories, activeCategory) {
  if (allCategories.length <= 1) {
    return `<div id="category-filters" class="category-filters" hidden></div>`;
  }
  const allBtn = `<button class="filter-pill${activeCategory === "Todos" ? " active" : ""}" data-cat="Todos">Todos</button>`;
  const catBtns = allCategories
    .map(
      (cat) =>
        `<button class="filter-pill${activeCategory === cat ? " active" : ""}" data-cat="${Shared.escapeHtml(cat)}">${Shared.escapeHtml(cat)}</button>`
    )
    .join("");
  return `<div id="category-filters" class="category-filters">${allBtn}${catBtns}</div>`;
}

// ---------- Home ----------

function buildHomePage(activeProducts, allCategories) {
  const title = "Porta Herramientas Colombia | Lexmonn";
  const description =
    "Porta herramientas y herramientas de construcción fabricados en Colombia. Pide los tuyos online y recíbelos por WhatsApp, con envíos a toda Colombia hoy.";

  const head = Shell.renderHead({
    title,
    description,
    canonical: `${SITE_URL}/`,
    breadcrumbJsonLd: Templates.renderBreadcrumbJsonLd([{ name: "Inicio", url: `${SITE_URL}/` }]),
  });

  const main = `<section class="hero">
    <img class="hero-bg-img" src="/hero-banner-2.jpeg" alt="Porta herramientas Lexmonn fabricados en Colombia" width="1600" height="682" loading="eager" fetchpriority="high">
    <div class="hero-content">
      <h1>Porta Herramientas fabricados en Colombia</h1>
      <p>Selecciona los productos que quieres comprar y envía tu pedido directo por WhatsApp.</p>
    </div>
  </section>

  <section id="loading" class="state-msg" hidden>Cargando catálogo...</section>

  <section id="sample-notice" class="notice-msg" hidden>
    Estás viendo un <strong>catálogo de ejemplo</strong>. Conecta tu Google Sheet en <code>config.js</code>
    (ver <code>INSTRUCCIONES.md</code>) para mostrar tus productos reales.
  </section>

  <section id="error" class="notice-msg error-msg" hidden>
    No se pudo conectar con tu Google Sheet, así que se muestra un catálogo de ejemplo mientras tanto.
    Revisa <code>SHEET_CSV_URL</code> en <code>config.js</code>.
  </section>

  ${Templates.renderOffersSection(activeProducts)}

  ${renderCategoryFilterPillsHtml(allCategories, "Todos")}

  <section id="catalog" class="catalog">${activeProducts.map(Templates.renderProductCard).join("")}</section>

  <section class="our-story">
    <div class="our-story-inner">
      <span class="story-eyebrow">Nuestra historia</span>
      <h2 class="story-heading">Cinco años de Lexmonn. Toda una vida entendiendo el gremio.</h2>
      <div class="story-body">
        <p>Detrás de Lexmonn hay una familia que ha estado ligada durante toda su vida al sector de la construcción. Crecer cerca de este gremio nos permitió conocer de primera mano las necesidades de quienes trabajan diariamente con herramientas y entender qué productos realmente necesitan en su día a día.</p>
        <p>Hace cinco años, ese conocimiento se convirtió en Lexmonn, con la idea de comercializar productos y soluciones para quienes hacen parte de este sector. Desde el comienzo fabricamos nuestros propios porta herramientas, desarrollados a partir de las necesidades de nuestros clientes y de la experiencia que ya teníamos con este gremio.</p>
        <p>Con el tiempo, las herramientas se convirtieron en un complemento fundamental para nuestro crecimiento. Entendimos que nuestros clientes no solo necesitaban productos para llevar sus herramientas, sino también las herramientas necesarias para realizar su trabajo. Así fuimos ampliando nuestra oferta y construyendo una propuesta cada vez más completa.</p>
        <p>Hoy somos la primera empresa colombiana especializada en la fabricación de porta herramientas de calidad garantizada, con más de diez líneas diseñadas para diferentes necesidades y tipos de trabajo.</p>
        <p>Cinco años después, seguimos creciendo con el mismo propósito: crear soluciones para quienes hacen el trabajo real.</p>
      </div>
    </div>
  </section>`;

  writeFile(
    "index.html",
    Shell.renderPage({ head, main })
  );
}

// ---------- Producto ----------

function buildProductPage(p, allCategories) {
  const catName = p.categoria || "Sin categoría";
  const catSlug = Shared.slugify(catName) || "sin-categoria";
  const canonical = `${SITE_URL}/productos/${p.slug}.html`;

  const title = `${p.nombre} | Lexmonn`;
  const description = Shared.truncateForMeta(
    `${p.nombre}: ${p.descripcion} Fabricado en Colombia, envíos a toda Colombia.`,
    160
  );

  const head = Shell.renderHead({
    title,
    description,
    canonical,
    ogImage: p.imagen || undefined,
    breadcrumbJsonLd: Templates.renderBreadcrumbJsonLd([
      { name: "Inicio", url: `${SITE_URL}/` },
      { name: catName, url: `${SITE_URL}/categoria/${catSlug}.html` },
      { name: p.nombre, url: canonical },
    ]),
    extraJsonLd: [Templates.renderProductJsonLd(p, canonical)],
  });

  const breadcrumbs = Templates.renderBreadcrumbs([
    { name: "Inicio", href: "/" },
    { name: catName, href: `/categoria/${catSlug}.html` },
    { name: p.nombre },
  ]);

  const { images, thumbsHtml } = Templates.renderGalleryThumbs(p);
  const mainImg = images[0] || Shared.PLACEHOLDER_IMG;
  const onSale = Shared.hasDiscount(p);
  const priceHtml = Templates.renderPriceHtml(p, { large: true });
  const waLink = Templates.buildWhatsAppLink(CONFIG.WHATSAPP_NUMBER, Templates.buildProductWhatsAppText(p));

  const main = `<section class="product-detail">
    ${breadcrumbs}
    <div class="product-modal-body product-detail-body">
      <div class="product-modal-gallery">
        <div class="product-modal-img-wrap">
          <img id="product-modal-img" class="product-modal-img" src="${mainImg}" alt="${Shared.escapeHtml(p.nombre)}" loading="eager" fetchpriority="high" onerror="this.src='${Shared.PLACEHOLDER_IMG}'">
          <span class="zoom-badge">🔍 Ampliar</span>
        </div>
        <div id="product-modal-thumbs" class="product-modal-thumbs"${thumbsHtml ? "" : " hidden"}>${thumbsHtml}</div>
      </div>
      <div class="product-modal-info">
        <span id="product-modal-discount-badge" class="discount-badge discount-badge-modal"${onSale ? "" : " hidden"}>${onSale ? `-${Shared.getDiscountPercent(p)}%` : ""}</span>
        <h1 id="product-modal-name">${Shared.escapeHtml(p.nombre)}</h1>
        <p id="product-modal-category" class="product-modal-category">Categoría: <a href="/categoria/${catSlug}.html"><strong>${Shared.escapeHtml(catName)}</strong></a></p>
        <p id="product-modal-desc" class="product-modal-desc">${Shared.escapeHtml(p.descripcion)}</p>
        <div class="sticky-buy-bar">
          <div id="product-modal-price" class="product-modal-price">${priceHtml}</div>
          <div class="product-modal-actions">
            <input type="number" id="product-modal-qty" class="qty-input qty-input-lg" min="1" value="1">
            <button id="product-modal-add" class="add-btn add-btn-lg" data-id="${Shared.escapeHtml(p.id)}">Añadir al carrito</button>
          </div>
        </div>
        <a class="whatsapp-direct-btn" href="${waLink}" target="_blank" rel="noopener">📲 Pedir por WhatsApp</a>
        <button id="product-share-btn" class="share-btn" type="button">🔗 Compartir producto</button>
        <a class="back-to-catalog" href="/">← Volver al catálogo</a>
      </div>
    </div>
  </section>`;

  writeFile(
    `productos/${p.slug}.html`,
    Shell.renderPage({
      head,
      main,
      bodyAttrs: `data-page="product" data-product-id="${Shared.escapeHtml(p.id)}"`,
    })
  );
}

function buildUnavailableProductPage(slug, nombre) {
  const canonical = `${SITE_URL}/productos/${slug}.html`;
  const head = Shell.renderHead({
    title: "Producto no disponible | Lexmonn",
    description: "Este producto ya no está disponible. Explora el catálogo completo de Lexmonn.",
    canonical,
    robots: "noindex, follow",
  });
  const msg = nombre
    ? `El producto <strong>${Shared.escapeHtml(nombre)}</strong> ya no está disponible actualmente.`
    : `Este producto ya no está disponible.`;
  const main = `<section class="product-unavailable">
    <h1>Producto no disponible</h1>
    <p>${msg}</p>
    <a class="back-to-catalog" href="/">← Ver el catálogo completo</a>
  </section>`;
  writeFile(`productos/${slug}.html`, Shell.renderPage({ head, main }));
}

// ---------- Privacidad ----------

// El aviso enlaza aquí. El contenido describe lo que el sitio hace DE VERDAD
// hoy: guarda el carrito en el navegador y manda el pedido por WhatsApp. Si
// algún día se agrega analítica o publicidad, hay que actualizar esta página
// junto con el texto del aviso en templates/shell.js.
function buildPrivacyPage() {
  const canonical = `${SITE_URL}/privacidad.html`;
  const head = Shell.renderHead({
    title: "Privacidad y tratamiento de datos | Lexmonn",
    description:
      "Qué datos guarda la tienda de Lexmonn, para qué los usa y cómo ejercer tus derechos. No usamos cookies de publicidad ni de seguimiento.",
    canonical,
    breadcrumbJsonLd: Templates.renderBreadcrumbJsonLd([
      { name: "Inicio", url: `${SITE_URL}/` },
      { name: "Privacidad y datos", url: canonical },
    ]),
  });

  const breadcrumbs = Templates.renderBreadcrumbs([
    { name: "Inicio", href: "/" },
    { name: "Privacidad y datos" },
  ]);

  const main = `<section class="legal-page">
    ${breadcrumbs}
    <h1>Privacidad y tratamiento de datos</h1>

    <h2>Qué guarda este sitio en tu navegador</h2>
    <p>Muy poco, y nada de eso sale de tu dispositivo:</p>
    <ul>
      <li><strong>Tu carrito.</strong> Se guarda para que no lo pierdas si cierras la pestaña y vuelves. Sin esto la tienda no funcionaría, así que es almacenamiento necesario.</li>
      <li><strong>Que ya viste el aviso de privacidad</strong>, para no repetírtelo en cada visita.</li>
      <li><strong>Que ya viste el aviso de promociones</strong>, para no mostrártelo dos veces en la misma sesión.</li>
    </ul>
    <p>Son tres datos técnicos que viven solo en tu navegador. Ninguno nos llega a nosotros, ninguno identifica quién eres, y puedes borrarlos cuando quieras limpiando los datos del sitio desde tu navegador.</p>

    <h2>Qué NO hacemos</h2>
    <p>Para que quede explícito, porque es distinto de lo que hacen muchas tiendas:</p>
    <ul>
      <li>No usamos cookies de publicidad ni de seguimiento.</li>
      <li>No tenemos Google Analytics, píxel de Meta ni ninguna herramienta que siga tu navegación.</li>
      <li>No construimos perfiles tuyos, no te mostramos anuncios personalizados y no vendemos ni compartimos tus datos con terceros.</li>
    </ul>

    <h2>Los datos que nos das al hacer un pedido</h2>
    <p>Cuando finalizas una compra te pedimos nombre, dirección, ciudad, teléfono, documento y, opcionalmente, correo. Esos datos <strong>no se guardan en este sitio web</strong>: se usan para armar el mensaje del pedido y se envían por <strong>WhatsApp</strong> al número de Lexmonn, donde quedan en esa conversación. Los usamos únicamente para procesar, despachar y facturar tu pedido, y para contactarte si hay algo que aclarar. Ten en cuenta que WhatsApp es un servicio de Meta y tiene sus propias condiciones.</p>

    <h2>Responsable del tratamiento</h2>
    <p>
      <strong>Lexmonn</strong> — NIT 901923669<br>
      Cll 54 cr 53-34, Bello, Antioquia, Colombia<br>
      Correo: <a href="mailto:lexmonn.admon@gmail.com">lexmonn.admon@gmail.com</a><br>
      Teléfono: 301 559 7873
    </p>

    <h2>Tus derechos</h2>
    <p>De acuerdo con la Ley 1581 de 2012 puedes conocer, actualizar y rectificar tus datos, pedir prueba de la autorización, ser informado del uso que les damos, presentar quejas ante la Superintendencia de Industria y Comercio, y revocar la autorización o pedir que los suprimamos. Para ejercer cualquiera de estos derechos escríbenos a <a href="mailto:lexmonn.admon@gmail.com">lexmonn.admon@gmail.com</a> y te respondemos.</p>

    <h2>¿Por qué esta página no te pide aceptar cookies?</h2>
    <p>Porque no tendría sentido. Los avisos de "Aceptar todo / Rechazar todo" existen donde hay cookies de publicidad y seguimiento que se activan según lo que elijas. Aquí no hay ninguna, así que darte dos botones sería pedirte permiso para algo que no ocurre. Preferimos decirte qué pasa y ya. Si algún día eso cambia, esta página lo dirá y sí te preguntaremos antes.</p>

    <h2>Volver a ver el aviso</h2>
    <p>Si cerraste el aviso de privacidad y quieres verlo de nuevo:</p>
    <p><button type="button" id="privacy-notice-reset" class="privacy-notice-btn">Ver el aviso otra vez</button></p>

    <p class="legal-updated">Última actualización: 27 de agosto de 2026.</p>
  </section>`;

  writeFile("privacidad.html", Shell.renderPage({ head, main }));
}

// ---------- 404 ----------

// GitHub Pages sirve /404.html automáticamente para cualquier ruta que no
// exista. Sin este archivo el visitante ve la página de error genérica de
// GitHub, sin logo ni forma de volver al catálogo.
function build404Page(categoryLinks) {
  const head = Shell.renderHead({
    title: "Página no encontrada | Lexmonn",
    description: "Esta página no existe. Explora el catálogo completo de porta herramientas y herramientas Lexmonn.",
    canonical: `${SITE_URL}/`,
    robots: "noindex, follow",
  });

  const catLinks = categoryLinks
    .map(
      (c) =>
        `<li><a href="/categoria/${c.slug}.html">${Shared.escapeHtml(c.name)}</a></li>`
    )
    .join("");

  const main = `<section class="product-unavailable">
    <h1>Esta página no existe</h1>
    <p>Puede que el enlace esté mal escrito o que el producto haya cambiado de nombre.</p>
    <a class="back-to-catalog" href="/">← Ver el catálogo completo</a>
    ${catLinks ? `<p>O ve directo a una categoría:</p><ul class="not-found-cats">${catLinks}</ul>` : ""}
  </section>`;

  writeFile("404.html", Shell.renderPage({ head, main }));
}

// ---------- Categoría ----------

function buildCategoryPage(catName, catSlug, products, allCategories) {
  const canonical = `${SITE_URL}/categoria/${catSlug}.html`;
  const title = `${catName} | Lexmonn`;
  const description = Shared.truncateForMeta(
    `Compra ${catName.toLowerCase()} fabricados en Colombia. Envíos a toda Colombia, pedidos directo por WhatsApp.`,
    160
  );

  const head = Shell.renderHead({
    title,
    description,
    canonical,
    breadcrumbJsonLd: Templates.renderBreadcrumbJsonLd([
      { name: "Inicio", url: `${SITE_URL}/` },
      { name: catName, url: canonical },
    ]),
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: products.map((p, idx) => ({
          "@type": "ListItem",
          position: idx + 1,
          item: Templates.renderProductJsonLd(p, `${SITE_URL}/productos/${p.slug}.html`),
        })),
      },
    ],
  });

  const breadcrumbs = Templates.renderBreadcrumbs([{ name: "Inicio", href: "/" }, { name: catName }]);

  const main = `<section class="category-hero">
    ${breadcrumbs}
    <h1>${Shared.escapeHtml(catName)}</h1>
    <p>Productos de ${Shared.escapeHtml(catName)} fabricados en Colombia. Elige los tuyos y envía tu pedido directo por WhatsApp.</p>
  </section>

  ${renderCategoryFilterPillsHtml(allCategories, catName)}

  <section id="catalog" class="catalog">${products.map(Templates.renderProductCard).join("")}</section>`;

  writeFile(
    `categoria/${catSlug}.html`,
    Shell.renderPage({
      head,
      main,
      bodyAttrs: `data-page="category" data-category="${Shared.escapeHtml(catName)}"`,
    })
  );
}

// ---------- Sitemap ----------

function buildSitemap(activeProducts, categoryLinks) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0" },
    ...categoryLinks.map((c) => ({ loc: `${SITE_URL}/categoria/${c.slug}.html`, priority: "0.7" })),
    ...activeProducts.map((p) => ({ loc: `${SITE_URL}/productos/${p.slug}.html`, priority: "0.8" })),
    { loc: `${SITE_URL}/privacidad.html`, priority: "0.3" },
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join("\n") +
    `\n</urlset>\n`;
  writeFile("sitemap.xml", xml);
}

// ---------- Orquestación ----------

async function main() {
  console.log("[build] Descargando catálogo desde Google Sheets...");
  const csvText = await fetchCsv(CONFIG.SHEET_CSV_URL);
  const allRows = Shared.parseCSV(csvText).map(Shared.normalizeProduct).filter((p) => p.id && p.nombre);
  const activeProducts = allRows.filter((p) => Shared.isActive(p.activo));

  if (activeProducts.length === 0) {
    console.error(
      "[build] ABORTANDO: el CSV no tiene ningún producto activo válido. No se sobrescribió ningún archivo."
    );
    process.exit(1);
  }

  console.log(`[build] ${activeProducts.length} productos activos de ${allRows.length} filas totales.`);

  // Un Precio_Oferta mal escrito (poner "20" donde iba "290000") publica el
  // producto casi regalado y nadie se entera hasta que llega el pedido. No se
  // bloquea el build — puede haber una liquidación real — pero se avisa fuerte.
  activeProducts.filter(Shared.hasDiscount).forEach((p) => {
    const pct = Shared.getDiscountPercent(p);
    if (pct >= 90) {
      console.warn(
        `[build] ¡OJO! "${p.nombre}" queda con ${pct}% de descuento: ` +
          `Precio ${p.precio} -> Precio_Oferta ${p.precioOferta}. ` +
          `Revisa esa celda en la Sheet, suele ser un error de digitación.`
      );
    }
  });

  const allCategories = getAllCategories(activeProducts);

  buildHomePage(activeProducts, allCategories);

  activeProducts.forEach((p) => buildProductPage(p, allCategories));

  // Productos desactivados en la Sheet (Activo = No) pero que siguen ahí:
  // se les avisa en su propia página en vez de dejarla con datos viejos.
  const inactivePresent = allRows.filter((p) => !Shared.isActive(p.activo) && p.slug);
  inactivePresent.forEach((p) => buildUnavailableProductPage(p.slug, p.nombre));

  // Páginas de producto que existían en un build anterior y ya no
  // corresponden a NINGUNA fila del CSV (se borró la fila por completo,
  // o el producto cambió de nombre y por lo tanto de slug).
  const productsDir = path.join(ROOT, "productos");
  const presentSlugs = new Set(allRows.map((p) => p.slug));
  if (fs.existsSync(productsDir)) {
    fs.readdirSync(productsDir)
      .filter((f) => f.endsWith(".html"))
      .map((f) => f.replace(/\.html$/, ""))
      .filter((slug) => !presentSlugs.has(slug))
      .forEach((slug) => buildUnavailableProductPage(slug, null));
  }

  const categoryMap = new Map();
  activeProducts.forEach((p) => {
    const cat = p.categoria || "Sin categoría";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat).push(p);
  });

  const categoryLinks = [];
  categoryMap.forEach((products, catName) => {
    const catSlug = Shared.slugify(catName) || "sin-categoria";
    buildCategoryPage(catName, catSlug, products, allCategories);
    categoryLinks.push({ name: catName, slug: catSlug });
  });

  build404Page(categoryLinks);
  buildPrivacyPage();

  buildSitemap(activeProducts, categoryLinks);

  console.log(
    `[build] Listo: index.html, ${activeProducts.length} páginas de producto, ${categoryLinks.length} páginas de categoría, 404.html, privacidad.html, sitemap.xml.`
  );
}

main().catch((err) => {
  console.error("[build] Falló:", err.message);
  process.exit(1);
});
