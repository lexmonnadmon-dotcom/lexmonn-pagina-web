#!/usr/bin/env node
// ============================================================
// LEXMONN - Script de build (SSG)
//
// Lee el catálogo real desde la Google Sheet (SHEET_CSV_URL en
// config.js) y genera:
//   - index.html                    (portada)
//   - catalogo.html                 (todos los productos en una grilla)
//   - productos/<slug>.html         (una página por producto activo)
//   - categoria/<slug>.html         (una página por categoría)
//   - sitemap.xml                   (con las fotos de cada producto)
//   - llms.txt                      (resumen para asistentes de IA)
//   - site.webmanifest
//
// Correr con:  node build.js
//
// No requiere que el cliente toque nada: sigue editando todo desde
// la Google Sheet exactamente igual que antes. Este script solo lee
// esa hoja y escribe los archivos HTML antes de publicar el sitio.
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const Shared = require("./lib/shared.js");
const Templates = require("./lib/templates.js");
const Shell = require("./templates/shell.js");
const CONFIG = require("./config.js");

const ROOT = __dirname;
const SITE_URL = Shell.SITE_URL;
const { icon } = Templates;
const esc = Shared.escapeHtml;

// La original (JPEG) es la que se comparte en redes y va a Google; en la
// página se muestran las versiones WebP de imagenes/opt/sitio/, y en celular
// un recorte más chico con el mismo encuadre (ver tools/optimizar-fotos.js).
const HERO_IMAGE = "/hero-banner-2.jpeg";
const HERO_PICTURE = `<picture class="hero-picture">
      <source media="(max-width: 480px)" type="image/webp" srcset="/imagenes/opt/sitio/hero-movil-960.webp">
      <source type="image/webp" srcset="/imagenes/opt/sitio/hero-1100.webp 1100w, /imagenes/opt/sitio/hero-1600.webp 1600w" sizes="100vw">
      <img class="hero-img" src="${HERO_IMAGE}" alt="" width="1600" height="682" fetchpriority="high" decoding="async">
    </picture>`;

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

// Versión de cada archivo estático = primeros caracteres del hash de su
// contenido. Va como ?v=... en la URL: cuando el archivo cambia, el
// navegador baja el nuevo en vez de mezclar un CSS viejo con HTML nuevo.
function computeAssetVersions() {
  const files = ["/style.css", "/app.js", "/config.js", "/sample-products.js", "/lib/fotos-optimizadas.js", "/lib/shared.js", "/lib/templates.js"];
  const versions = {};
  files.forEach((f) => {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) {
      versions[f] = crypto.createHash("md5").update(fs.readFileSync(full)).digest("hex").slice(0, 8);
    }
  });
  return versions;
}

function getAllCategories(products) {
  const seen = [];
  products.forEach((p) => {
    const cat = p.categoria || "Sin categoría";
    if (!seen.includes(cat)) seen.push(cat);
  });
  return seen;
}

// Cómo se presenta cada categoría: la frase del mosaico, la foto que la
// representa, el orden, y los textos para buscadores (la presentación de la
// página y la descripción que muestra Google).
//
// Esto vive aquí y NO en la Google Sheet a propósito. Son textos de marca,
// no datos de catálogo: el negocio no debería tener que escribirlos cada vez
// que agrega un producto.
//
// Los textos hablan de TIPOS de producto y no de productos puntuales, para
// que no queden desactualizados cuando cambie el surtido. Las marcas y la
// cantidad de productos de cada categoría se calculan solos en cada build.
//
// Si alguien renombra una categoría en la Sheet, su fila deja de coincidir y
// la categoría cae a los valores por defecto (foto del primer producto, sin
// frase, y un texto genérico). El build NO se rompe.
const CATEGORIA_PRESENTACION = {
  "Porta Herramientas": {
    orden: 1,
    tagline: "Los que fabricamos nosotros, hechos para aguantar la obra.",
    imagen: "/imagenes/lexmonn-morral-porta-herramientas.jpg",
    // La única categoría de fabricación propia. Decirlo vale más que decir
    // cuántos productos tiene.
    insignia: "Fabricación propia",
    intro:
      "Cinturones, morrales, bolsos, cargaderas y bolsillos porta herramientas diseñados y fabricados por Lexmonn en Colombia. Líneas pensadas para drywall, electricidad y construcción, con materiales reforzados para el trabajo diario en obra.",
    metaDescription:
      "Porta herramientas fabricados en Colombia por Lexmonn: cinturones, morrales, bolsos, cargaderas y bolsillos para drywall y electricistas. Envíos a todo el país.",
  },
  "Herramientas Total": {
    orden: 2,
    tagline: "Taladros, pulidora, martillos y navajas: toda la línea Total en un solo lugar.",
    imagen: "/imagenes/total-taladro-inalambrico-12v.jpg",
    intro:
      "Herramienta eléctrica, inalámbrica y manual de la marca Total: taladros, rotomartillos, pulidoras, sierras, baterías y cargadores de 20V, además de martillos, flexómetros, alicates y accesorios para obra.",
    metaDescription:
      "Herramientas Total en Colombia: taladros y rotomartillos inalámbricos, pulidoras, sierras, baterías 20V y herramienta manual. Pide por WhatsApp con envío nacional.",
  },
  "Herramientas Truper": {
    orden: 3,
    tagline: "Tapizadoras, espátulas, navajas y niveles: toda la línea Truper en un solo lugar.",
    imagen: "/imagenes/truper-tapizadora-12.jpg",
    intro:
      "Herramienta Truper y Truper Expert para acabados y construcción: tapizadoras, espátulas, niveles, escuadras, pinzas, martillos, brocas, discos y accesorios de corte.",
    metaDescription:
      "Herramientas Truper: tapizadoras, espátulas, niveles, pinzas, martillos, brocas y discos para obra. Arma tu pedido y envíalo por WhatsApp. Envíos a toda Colombia.",
  },
  "Drywall y Acabados": {
    orden: 4,
    tagline: "Espátulas, serrucho y mezclador para dejar la junta lista.",
    imagen: "/imagenes/husky-espatula-encintadora-8.jpg",
    intro:
      "Todo para instalar y dar acabado a drywall: espátulas profesionales de varios anchos, encintadoras, cajas y cabezales de acabado, esquineros, lijadoras, mezcladores y repuestos para dejar la junta lista.",
    metaDescription:
      "Herramientas para drywall y acabados: espátulas, encintadoras, cajas de acabado, cabezales angulares, esquineros y lijadoras. Envíos a toda Colombia.",
  },
  "Herramientas de Construcción": {
    orden: 5,
    tagline: "Pinzas, destornilladores y soportes para el día a día.",
    imagen: "/imagenes/stanley-destornillador.jpg",
    intro:
      "Herramienta para el día a día en obra: pinzas, destornilladores, llaves combinadas, discos de corte y desbaste, brocas, cautines y fijación.",
    metaDescription:
      "Herramientas de construcción: pinzas, destornilladores, llaves combinadas, discos de corte, brocas y cautines para obra. Pedido por WhatsApp y envíos a toda Colombia.",
  },
  "Corte y Cuchillas": {
    orden: 6,
    tagline: "Navajas y repuestos que mantienen el filo toda la jornada.",
    imagen: "/imagenes/stanley-navaja-classic-99.jpg",
    intro:
      "Navajas, bisturís y cuchillas de repuesto para cortar drywall, cartón, cinta y materiales de obra, con hojas de uso general, trapezoidales y dentadas.",
    metaDescription:
      "Navajas, bisturís y cuchillas de repuesto para drywall y obra: hojas trapezoidales, dentadas y de uso general. Envíos a toda Colombia, pedido por WhatsApp.",
  },
  "Medición y Nivelación": {
    orden: 7,
    tagline: "Flexómetros, niveles y escuadras para no repetir el trabajo.",
    imagen: "/imagenes/stanley-flexometro-global-plus-8m.jpg",
    intro:
      "Flexómetros, escuadras y accesorios para nivel láser para medir, trazar y nivelar con precisión en obra.",
    metaDescription:
      "Flexómetros, escuadras y placas de puntería para nivel láser. Mide y nivela con precisión. Pedido por WhatsApp y envíos a toda Colombia.",
  },
  "Seguridad Industrial": {
    orden: 8,
    tagline: "Lo que protege al que está parado en la obra.",
    imagen: "/imagenes/energizer-linterna-frontal-vision-hd.jpg",
    intro:
      "Elementos de protección personal para obra: cascos, gafas de seguridad, chalecos reflectivos, rodilleras y linternas frontales.",
    metaDescription:
      "Seguridad industrial para obra: cascos, gafas de seguridad, chalecos reflectivos, rodilleras y linternas frontales. Envíos a toda Colombia, pedido por WhatsApp.",
  },
  "Discos y Brocas": {
    orden: 9,
    tagline: "Discos de corte, desbaste y brocas para dejar cada corte limpio.",
    imagen: "/imagenes/dewalt-disco-corte-metal-4-5.jpg",
    intro: "Discos de corte, desbaste y diamantados, y brocas para madera, metal y concreto.",
    metaDescription: "Discos de corte, desbaste y diamantados, y brocas para madera, metal y concreto. Envíos a toda Colombia.",
  },
  "Herrajes y Accesorios": {
    orden: 10,
    tagline: "Candados, grapas y los pequeños accesorios que no pueden faltar en la caja.",
    imagen: "/imagenes/hermex-candado-cable-bicicleta.jpg",
    intro: "Grapas, candados, pulseras magnéticas porta tornillos y los accesorios pequeños que no pueden faltar en la caja de herramientas.",
    metaDescription:
      "Grapas, candados, pulseras magnéticas porta tornillos y accesorios para la caja de herramientas. Envíos a toda Colombia, pedido por WhatsApp.",
  },
};

// Arma los datos de cada categoría a partir de lo que trajo la Sheet. Las que
// no estén en la tabla de arriba (una categoría nueva) no se pierden: van al
// final, con la foto de su primer producto.
function buildCategoryInfo(categoryMap) {
  const cats = [];
  categoryMap.forEach((products, name) => {
    const pres = CATEGORIA_PRESENTACION[name] || {};
    const prices = products.map(Shared.getEffectivePrice).filter((n) => n > 1);
    cats.push({
      name,
      slug: Shared.slugify(name) || "sin-categoria",
      count: products.length,
      products,
      image: pres.imagen || (products[0] && products[0].imagen) || "",
      tagline: pres.tagline || "",
      insignia: pres.insignia || "",
      intro: pres.intro || `Productos de ${name} disponibles en Lexmonn, con envío a toda Colombia.`,
      metaDescription:
        pres.metaDescription ||
        `${name} en Lexmonn: herramienta para obra con envíos a toda Colombia. Arma tu pedido y envíalo por WhatsApp.`,
      brands: uniqueBrands(products),
      minPrice: prices.length ? Math.min(...prices) : 0,
      orden: pres.orden || 99,
    });
  });
  return cats.sort((a, b) => a.orden - b.orden);
}

function uniqueBrands(products) {
  const counts = new Map();
  products.forEach((p) => {
    if (p.marca) counts.set(p.marca, (counts.get(p.marca) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

function joinList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function renderCategoryFilterPillsHtml(allCategories, activeCategory) {
  if (allCategories.length <= 1) {
    return `<div id="category-filters" class="category-filters" hidden></div>`;
  }
  const allBtn = `<button type="button" class="filter-pill${activeCategory === "Todos" ? " active" : ""}" data-cat="Todos">Todos</button>`;
  const catBtns = allCategories
    .map(
      (cat) =>
        `<button type="button" class="filter-pill${activeCategory === cat ? " active" : ""}" data-cat="${esc(cat)}">${esc(cat)}</button>`
    )
    .join("");
  return `<div id="category-filters" class="category-filters" role="toolbar" aria-label="Filtrar por categoría">${allBtn}${catBtns}</div>`;
}

// Barra de herramientas sobre la grilla: cuántos productos se ven y cómo
// ordenarlos. `app.js` actualiza el conteo en vivo al buscar o filtrar.
function renderCatalogToolbar(count) {
  return `<div class="catalog-toolbar">
      <p class="result-count" id="result-count" aria-live="polite">${count} ${count === 1 ? "producto" : "productos"}</p>
      <label class="sort-control">
        <span>Ordenar por</span>
        <select id="sort-select">
          <option value="nombre">Nombre (A–Z)</option>
          <option value="precio-asc">Menor precio</option>
          <option value="precio-desc">Mayor precio</option>
        </select>
      </label>
    </div>`;
}

// ---------- Home ----------

// Preguntas frecuentes. Todo lo que dicen sale de cómo funciona el sitio de
// verdad (pedido por WhatsApp, envíos por transportadora, datos que se piden)
// y de los datos del negocio. Si algo de eso cambia, hay que cambiarlo aquí.
const FAQ = [
  {
    q: "¿Cómo hago un pedido en Lexmonn?",
    a: "Agrega los productos al carrito, toca “Finalizar pedido por WhatsApp” y completa tus datos de entrega. Se abre WhatsApp con el pedido ya armado para que lo envíes a Lexmonn, y ahí te confirmamos disponibilidad y envío.",
  },
  {
    q: "¿Hacen envíos a toda Colombia?",
    a: "Sí. Despachamos a todo el país por transportadora. Los detalles del envío a tu ciudad te los confirmamos por WhatsApp al recibir tu pedido.",
  },
  {
    q: "¿Los porta herramientas los fabrican ustedes?",
    a: "Sí. Los cinturones, morrales, bolsos y bolsillos porta herramientas Lexmonn los diseñamos y fabricamos nosotros, en Colombia. El resto del catálogo son herramientas de marcas como Total, Truper, DeWalt y Stanley.",
  },
  {
    q: "¿Dónde están ubicados y en qué horario atienden?",
    a: "Estamos en la Cll 54 cr 53-34, Bello, Antioquia. Atendemos de lunes a viernes de 8:00 a.m. a 6:30 p.m. y los sábados de 9:00 a.m. a 3:00 p.m.",
  },
  {
    q: "¿Qué datos me piden para comprar?",
    a: "Nombre, cédula o NIT, dirección, ciudad, teléfono y correo. La cédula (o el NIT de tu empresa) y el correo son para la factura electrónica y el envío. El sitio no guarda esos datos: van solo en el mensaje de WhatsApp con tu pedido.",
  },
];

function buildHomePage(activeProducts, cats) {
  const title = "Lexmonn – Fabricando calidad y revolucionando la forma en que trabajas";
  const description =
    // El pedido se ENVÍA por WhatsApp; el producto llega por transportadora.
    // Y "fabricados en Colombia" solo aplica a los porta herramientas: el
    // resto del catálogo es herramienta de marcas de reventa.
    "Porta herramientas fabricados en Colombia y herramientas para drywall y construcción. Arma tu pedido en línea y envíalo por WhatsApp. Envíos a todo el país.";

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const head = Shell.renderHead({
    title,
    description,
    canonical: `${SITE_URL}/`,
    ogImage: `${SITE_URL}${HERO_IMAGE}`,
    ogImageAlt: "Instalador de drywall con cinturón porta herramientas Lexmonn en obra",
    includeOrg: true,
    extraJsonLd: [faqJsonLd],
  });

  const topBrands = uniqueBrands(activeProducts).filter((b) => b !== "Lexmonn").slice(0, 4);

  // El <h1> es el mismo texto que ya tenía la portada: es la frase que
  // describe lo que hace Lexmonn y la que se busca.
  const hero = `<section class="hero" aria-labelledby="hero-title">
    ${HERO_PICTURE}
    <div class="container hero-inner">
      <p class="eyebrow eyebrow-dark">${icon("factory", 16)} Fabricación propia · Hecho en Colombia</p>
      <h1 id="hero-title" class="hero-title">Porta herramientas <span>fabricados en Colombia</span></h1>
      <p class="hero-lead">Cinturones, morrales y bolsillos hechos para aguantar la obra, y la herramienta de las marcas que ya conoces${topBrands.length ? ` — ${esc(joinList(topBrands))}` : ""}. Armas tu pedido aquí y lo envías por WhatsApp.</p>
      <div class="hero-actions">
        <a class="btn btn-lime btn-lg" href="/catalogo.html">Ver el catálogo ${icon("arrowRight", 20)}</a>
        <a class="btn btn-ghost-light btn-lg" href="${Shell.WHATSAPP_URL}" target="_blank" rel="noopener">${icon("whatsapp", 20)} Escríbenos</a>
      </div>
      <ul class="hero-stats">
        <li><strong>${activeProducts.length}</strong><span>productos</span></li>
        <li><strong>${cats.length}</strong><span>categorías</span></li>
        <li><strong>5</strong><span>años en el gremio</span></li>
      </ul>
    </div>
  </section>
  <div class="ruler" aria-hidden="true"></div>`;

  const trust = `<section class="trust" aria-label="Por qué comprar en Lexmonn">
    <div class="container trust-grid">
      <div class="trust-item">${icon("factory", 28)}<div><strong>Fabricación propia</strong><span>Porta herramientas diseñados y hechos en Colombia.</span></div></div>
      <div class="trust-item">${icon("truck", 28)}<div><strong>Envíos a toda Colombia</strong><span>Despachamos por transportadora a tu ciudad.</span></div></div>
      <div class="trust-item">${icon("whatsapp", 28)}<div><strong>Pedido por WhatsApp</strong><span>Te confirmamos disponibilidad antes de despachar.</span></div></div>
      <div class="trust-item">${icon("clock", 28)}<div><strong>Atención de lunes a sábado</strong><span>L–V 8:00–6:30 · Sáb 9:00–3:00.</span></div></div>
    </div>
  </section>`;

  const categories = `<section class="section" aria-labelledby="cats-title">
    <div class="container">
      <div class="section-head">
        <div>
          <p class="eyebrow">Compra por categoría</p>
          <h2 id="cats-title" class="section-title">¿Qué necesitas para la obra?</h2>
        </div>
        <a class="link-arrow" href="/catalogo.html">Ver todo el catálogo ${icon("arrowRight", 18)}</a>
      </div>
      ${Templates.renderCategoryTiles(cats)}
    </div>
  </section>`;

  // Tres pasos de verdad en secuencia: aquí sí tiene sentido numerarlos.
  const steps = `<section class="section section-alt" aria-labelledby="steps-title">
    <div class="container">
      <div class="section-head section-head-center">
        <div>
          <p class="eyebrow">Así de simple</p>
          <h2 id="steps-title" class="section-title">Cómo comprar en Lexmonn</h2>
        </div>
      </div>
      <ol class="steps">
        <li class="step">
          <span class="step-num">1</span>
          <h3>Arma tu carrito</h3>
          <p>Busca por nombre o entra por categoría y agrega lo que necesites.</p>
        </li>
        <li class="step">
          <span class="step-num">2</span>
          <h3>Envía el pedido por WhatsApp</h3>
          <p>Completa tus datos de entrega y se abre WhatsApp con el pedido ya escrito.</p>
        </li>
        <li class="step">
          <span class="step-num">3</span>
          <h3>Te confirmamos y despachamos</h3>
          <p>Te respondemos por WhatsApp para confirmar disponibilidad, pago y envío, y lo despachamos a tu ciudad.</p>
        </li>
      </ol>
    </div>
  </section>`;

  const story = `<section class="section story" aria-labelledby="story-title">
    <div class="container story-grid">
      <div class="story-aside">
        <p class="eyebrow">Nuestra historia</p>
        <h2 id="story-title" class="section-title">Cinco años de Lexmonn. Toda una vida entendiendo el gremio.</h2>
        <ul class="story-facts">
          <li><strong>5</strong><span>años fabricando</span></li>
          <li><strong>+10</strong><span>líneas de porta herramientas</span></li>
          <li><strong>1ª</strong><span>empresa colombiana especializada en porta herramientas</span></li>
        </ul>
      </div>
      <div class="story-body">
        <p>Detrás de Lexmonn hay una familia que ha estado ligada durante toda su vida al sector de la construcción. Crecer cerca de este gremio nos permitió conocer de primera mano las necesidades de quienes trabajan diariamente con herramientas y entender qué productos realmente necesitan en su día a día.</p>
        <p>Hace cinco años, ese conocimiento se convirtió en Lexmonn, con la idea de comercializar productos y soluciones para quienes hacen parte de este sector. Desde el comienzo fabricamos nuestros propios porta herramientas, desarrollados a partir de las necesidades de nuestros clientes y de la experiencia que ya teníamos con este gremio.</p>
        <p>Con el tiempo, las herramientas se convirtieron en un complemento fundamental para nuestro crecimiento. Entendimos que nuestros clientes no solo necesitaban productos para llevar sus herramientas, sino también las herramientas necesarias para realizar su trabajo. Así fuimos ampliando nuestra oferta y construyendo una propuesta cada vez más completa.</p>
        <p>Hoy somos la primera empresa colombiana especializada en la fabricación de porta herramientas de calidad garantizada, con más de diez líneas diseñadas para diferentes necesidades y tipos de trabajo.</p>
        <p class="story-close">Cinco años después, seguimos creciendo con el mismo propósito: crear soluciones para quienes hacen el trabajo real.</p>
      </div>
    </div>
  </section>`;

  const faq = `<section class="section section-alt" aria-labelledby="faq-title">
    <div class="container faq-grid">
      <div>
        <p class="eyebrow">Preguntas frecuentes</p>
        <h2 id="faq-title" class="section-title">Lo que más nos preguntan</h2>
        <p class="section-lead">¿Tienes otra duda? Escríbenos y te respondemos en el horario de atención.</p>
        <a class="btn btn-wa" href="${Shell.WHATSAPP_URL}" target="_blank" rel="noopener">${icon("whatsapp", 20)} Escribir por WhatsApp</a>
      </div>
      <div class="faq-list">
        ${FAQ.map(
          (f) => `<details class="faq-item">
          <summary>${esc(f.q)}${icon("chevronDown", 20)}</summary>
          <p>${esc(f.a)}</p>
        </details>`
        ).join("")}
      </div>
    </div>
  </section>`;

  const main = `${hero}
  ${trust}
  ${categories}
  ${Templates.renderOffersSection(activeProducts)}
  ${steps}
  ${story}
  ${faq}`;

  writeFile("index.html", Shell.renderPage({ head, main, bodyAttrs: 'data-page="home"' }));
}

// ---------- Catálogo completo ----------

// Desde el 2026-09-02 la home ya NO lleva la grilla de productos: se entra por
// las categorías. Esta página es la que recoge "ver todo", y también donde
// aterriza el buscador desde cualquier otra página.
function buildCatalogPage(activeProducts, allCategories) {
  const canonical = `${SITE_URL}/catalogo.html`;
  const title = "Catálogo de porta herramientas y herramientas | Lexmonn";
  const description = Shared.truncateForMeta(
    `Los ${activeProducts.length} productos de Lexmonn: porta herramientas fabricados en Colombia, herramientas Total y Truper, drywall, corte, medición y seguridad. Envíos a toda Colombia.`,
    160
  );

  const head = Shell.renderHead({
    title,
    description,
    canonical,
    breadcrumbJsonLd: Templates.renderBreadcrumbJsonLd([
      { name: "Inicio", url: `${SITE_URL}/` },
      { name: "Catálogo", url: canonical },
    ]),
  });

  const breadcrumbs = Templates.renderBreadcrumbs([{ name: "Inicio", href: "/" }, { name: "Catálogo" }]);

  const main = `<section class="page-hero">
    <div class="container">
      ${breadcrumbs}
      <h1 class="page-title">Todo el catálogo</h1>
      <p class="page-lead">Porta herramientas fabricados por Lexmonn y herramienta de las mejores marcas para la obra. Filtra por categoría o busca por nombre, arma tu pedido y envíalo por WhatsApp.</p>
    </div>
  </section>

  <section class="section section-tight" aria-label="Productos">
    <div class="container">
      <div id="loading" class="state-msg" hidden>Cargando catálogo…</div>
      <div id="sample-notice" class="notice-msg" hidden>
        Estás viendo un <strong>catálogo de ejemplo</strong>. Conecta tu Google Sheet en <code>config.js</code>
        (ver <code>INSTRUCCIONES.md</code>) para mostrar tus productos reales.
      </div>
      <div id="error" class="notice-msg error-msg" hidden>
        No se pudo conectar con tu Google Sheet, así que se muestra un catálogo de ejemplo mientras tanto.
        Revisa <code>SHEET_CSV_URL</code> en <code>config.js</code>.
      </div>

      ${renderCategoryFilterPillsHtml(allCategories, "Todos")}
      ${renderCatalogToolbar(activeProducts.length)}

      <div id="catalog" class="product-grid">${activeProducts.map(Templates.renderProductCard).join("")}</div>
    </div>
  </section>`;

  writeFile(
    "catalogo.html",
    Shell.renderPage({ head, main, navCurrent: "catalogo", bodyAttrs: 'data-page="catalog"' })
  );
}

// ---------- Producto ----------

// Productos de la misma categoría, empezando justo después del actual y
// dando la vuelta. Así cada página enlaza a vecinos distintos en vez de que
// todas apunten a los mismos ocho primeros: los enlaces internos quedan
// repartidos por todo el catálogo.
function relatedProducts(p, siblings, max) {
  const others = siblings.filter((x) => x.id !== p.id);
  if (others.length <= max) return others;
  const idx = siblings.findIndex((x) => x.id === p.id);
  const rotated = [...siblings.slice(idx + 1), ...siblings.slice(0, idx)].filter((x) => x.id !== p.id);
  return rotated.slice(0, max);
}

function buildProductPage(p, cat) {
  const catName = p.categoria || "Sin categoría";
  const catSlug = cat ? cat.slug : Shared.slugify(catName) || "sin-categoria";
  const canonical = `${SITE_URL}/productos/${p.slug}.html`;

  // Nombres muy cortos ("Cargaderas", "Porta taladro") no dicen de qué se
  // trata en el resultado de Google: a esos se les suma la categoría.
  const title = p.nombre.length < 32 ? `${p.nombre} – ${catName} | Lexmonn` : `${p.nombre} | Lexmonn`;

  // Sin "fabricado en Colombia" salvo en los de fabricación propia: la mayoría
  // del catálogo son marcas de reventa (Truper, DeWalt, Stanley...) y decirlo
  // sería falso.
  //
  // El cierre se reserva su espacio y se pega DESPUÉS de truncar, en vez de
  // ir dentro del texto que se corta. Si no, en los productos de nombre o
  // descripción larga la frase quedaba partida a la mitad ("Envíos a…").
  const cierre = " Envíos a toda Colombia, pedido por WhatsApp.";
  const cuerpo = p.descripcion
    ? `${p.nombre}: ${p.descripcion}`
    : p.marca === "Lexmonn"
      ? `${p.nombre}, porta herramientas fabricado en Colombia por Lexmonn.`
      : `${p.nombre}${p.marca ? ` ${p.marca}` : ""} en la categoría ${catName} de Lexmonn.`;
  const description = Shared.truncateForMeta(cuerpo, 160 - cierre.length) + cierre;

  const head = Shell.renderHead({
    title,
    description,
    canonical,
    ogImage: p.imagen || undefined,
    ogImageAlt: p.nombre,
    ogType: "product",
    productPrice: Shared.getEffectivePrice(p),
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

  const { thumbsHtml } = Templates.renderGalleryThumbs(p);
  const onSale = Shared.hasDiscount(p);
  const priceHtml = Templates.renderPriceHtml(p, { large: true });
  const waLink = Templates.buildWhatsAppLink(CONFIG.WHATSAPP_NUMBER, Templates.buildProductWhatsAppText(p));
  const isOwn = p.marca === "Lexmonn";

  const related = cat ? relatedProducts(p, cat.products, 8) : [];
  const relatedHtml = related.length
    ? `<section class="section section-alt" aria-labelledby="related-title">
    <div class="container">
      <div class="section-head">
        <div>
          <p class="eyebrow">Sigue viendo</p>
          <h2 id="related-title" class="section-title">Más de ${esc(catName)}</h2>
        </div>
        <a class="link-arrow" href="/categoria/${catSlug}.html">Ver toda la categoría ${icon("arrowRight", 18)}</a>
      </div>
      <div class="product-grid">${related.map(Templates.renderProductCard).join("")}</div>
    </div>
  </section>`
    : "";

  const main = `<section class="product-detail">
    <div class="container">
      ${breadcrumbs}
      <div class="product-layout">
        <div class="gallery">
          <div class="gallery-main">
            ${Templates.renderMainPhoto(p)}
            <button type="button" id="zoom-btn" class="zoom-badge">${icon("zoom", 16)} Ampliar</button>
            <span id="product-modal-discount-badge" class="discount-badge discount-badge-lg"${onSale ? "" : " hidden"}>${onSale ? `-${Shared.getDiscountPercent(p)}%` : ""}</span>
          </div>
          <div id="product-modal-thumbs" class="gallery-thumbs"${thumbsHtml ? "" : " hidden"}>${thumbsHtml}</div>
        </div>

        <div class="product-info">
          <p class="product-info-cat">
            <a href="/categoria/${catSlug}.html">${esc(catName)}</a>${p.marca && !catName.includes(p.marca) ? ` <span aria-hidden="true">·</span> <span>${esc(p.marca)}</span>` : ""}
          </p>
          <h1 id="product-modal-name" class="product-info-title">${esc(p.nombre)}</h1>
          ${isOwn ? `<p class="own-pill">${icon("factory", 16)} Fabricado por Lexmonn en Colombia</p>` : ""}
          <div id="product-modal-price" class="product-info-price">${priceHtml}</div>
          ${p.descripcion ? `<p id="product-modal-desc" class="product-info-desc">${esc(p.descripcion)}</p>` : ""}

          <div class="buy-box">
            <div class="qty-stepper" role="group" aria-label="Cantidad">
              <button type="button" class="qty-btn" data-qty-step="-1" aria-label="Quitar una unidad">${icon("minus", 18)}</button>
              <input type="number" id="product-modal-qty" class="qty-input" min="1" value="1" inputmode="numeric" aria-label="Cantidad">
              <button type="button" class="qty-btn" data-qty-step="1" aria-label="Agregar una unidad">${icon("plus", 18)}</button>
            </div>
            <button type="button" id="product-modal-add" class="btn btn-lime btn-lg add-main" data-add="${esc(p.id)}" data-qty-input="product-modal-qty">${icon("cart", 20)} Añadir al carrito</button>
          </div>
          <a class="btn btn-wa btn-block" href="${waLink}" target="_blank" rel="noopener">${icon("whatsapp", 20)} Pedir este producto por WhatsApp</a>

          <ul class="assurance">
            <li>${icon("truck", 20)} <span><strong>Envíos a toda Colombia</strong> por transportadora.</span></li>
            <li>${icon("check", 20)} <span><strong>Confirmamos por WhatsApp</strong> disponibilidad y detalles del envío antes de despachar.</span></li>
            <li>${icon("pin", 20)} <span><strong>Bello, Antioquia.</strong> L–V 8:00–6:30 · Sáb 9:00–3:00.</span></li>
          </ul>

          <button id="product-share-btn" class="text-btn" type="button">${icon("share", 18)} <span class="text-btn-label">Compartir producto</span></button>
        </div>
      </div>
    </div>
  </section>
  ${relatedHtml}`;

  writeFile(
    `productos/${p.slug}.html`,
    Shell.renderPage({
      head,
      main,
      navCurrent: catSlug,
      bodyAttrs: `data-page="product" data-product-id="${esc(p.id)}"`,
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
    ? `El producto <strong>${esc(nombre)}</strong> ya no está disponible actualmente.`
    : `Este producto ya no está disponible.`;
  const main = `<section class="empty-page">
    <div class="container empty-page-inner">
      <p class="eyebrow">Sin existencias</p>
      <h1 class="page-title">Producto no disponible</h1>
      <p class="page-lead">${msg}</p>
      <a class="btn btn-lime" href="/catalogo.html">${icon("arrowLeft", 20)} Ver el catálogo completo</a>
    </div>
  </section>`;
  writeFile(`productos/${slug}.html`, Shell.renderPage({ head, main }));
}

// Un producto que solo CAMBIÓ DE NOMBRE en la Sheet cambia de URL (el slug
// sale del nombre). Su página vieja ya puede estar en Google o compartida por
// WhatsApp: en vez de decir "no disponible", redirige a la nueva. GitHub
// Pages no permite redirecciones del servidor; un meta refresh inmediato es
// lo que Google trata como redirección permanente, y la canónica lo refuerza.
function buildRedirectPage(oldSlug, target) {
  const url = `${SITE_URL}/productos/${target.slug}.html`;
  writeFile(
    `productos/${oldSlug}.html`,
    `<!DOCTYPE html>
<html lang="es-CO">
<head>
<meta charset="UTF-8">
<title>${esc(target.nombre)} | Lexmonn</title>
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=/productos/${target.slug}.html">
</head>
<body>
<p>Este producto cambió de dirección: <a href="/productos/${target.slug}.html">${esc(target.nombre)}</a>.</p>
</body>
</html>
`
  );
}

// Los IDs de la Sheet se reutilizan (el ID de un producto borrado puede
// quedar para otro distinto), así que el ID solo no alcanza para decidir que
// es el mismo producto renombrado: además el nombre viejo y el nuevo tienen
// que compartir al menos la mitad de las palabras del nombre viejo.
//
// No cuentan las marcas ni las palabras genéricas de la tienda: dos productos
// Total distintos comparten "total" y no por eso son el mismo producto.
const MARCAS_EN_SLUG = new Set([
  "total", "truper", "dewalt", "stanley", "milwaukee", "husky", "marshalltown", "level5", "tapetech",
  "tajima", "pretul", "wadfow", "energizer", "anvil", "arrow", "hermex", "empire", "ramset", "forte",
  "toolpro", "yesbes", "rankee", "lexmonn",
]);
const PALABRAS_QUE_NO_IDENTIFICAN = new Set([
  ...MARCAS_EN_SLUG,
  "porta", "herramientas", "para", "pulgadas", "pulgada", "unidades", "piezas", "profesional",
]);

const nombreDelSlug = (slug) => slug.replace(/-\d+$/, "");
const marcaDelSlug = (slug) => slug.split("-").find((w) => MARCAS_EN_SLUG.has(w)) || "";

// Orden de las pruebas:
// 1. El mismo ID, si comparte al menos la mitad de las palabras propias del
//    nombre viejo y NO es de otra marca (un martillo Truper cuyo ID quedó
//    para un martillo Total no es el mismo producto).
// 2. Si no, un producto activo con exactamente el mismo nombre y otro ID
//    (el producto siguió existiendo pero con ID nuevo).
function findRenamedTarget(oldSlug, activeById, activeByName) {
  const m = oldSlug.match(/-(\d+)$/);
  const sameId = m && activeById.get(m[1]);
  if (sameId) {
    const marcaVieja = marcaDelSlug(oldSlug);
    const marcaNueva = marcaDelSlug(sameId.slug);
    const otraMarca = marcaVieja && marcaNueva && marcaVieja !== marcaNueva;
    const words = (s) =>
      new Set(s.split("-").filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !PALABRAS_QUE_NO_IDENTIFICAN.has(w)));
    const viejas = [...words(oldSlug)];
    const nuevas = words(sameId.slug);
    const comunes = viejas.filter((w) => nuevas.has(w)).length;
    if (!otraMarca && viejas.length && comunes >= Math.max(1, Math.ceil(viejas.length / 2))) return sameId;
  }
  return activeByName.get(nombreDelSlug(oldSlug)) || null;
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

  const breadcrumbs = Templates.renderBreadcrumbs([{ name: "Inicio", href: "/" }, { name: "Privacidad y datos" }]);

  const main = `<section class="page-hero">
    <div class="container">
      ${breadcrumbs}
      <h1 class="page-title">Privacidad y tratamiento de datos</h1>
      <p class="page-lead">Qué guarda este sitio, qué no hacemos y cómo ejercer tus derechos.</p>
    </div>
  </section>
  <section class="section section-tight">
    <div class="container">
      <div class="legal-page">
        <h2>Qué guarda este sitio en tu navegador</h2>
        <p>Muy poco, y nada de eso sale de tu dispositivo:</p>
        <ul>
          <li><strong>Tu carrito.</strong> Se guarda para que no lo pierdas si cierras la pestaña y vuelves. Sin esto la tienda no funcionaría, así que es almacenamiento necesario.</li>
          <li><strong>Que ya viste el aviso de privacidad</strong>, para no repetírtelo en cada visita.</li>
          <li><strong>La fecha en que viste el aviso de promociones</strong>, para no repetírtelo en cada página que abras. Pasado un día se puede volver a mostrar.</li>
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
        <p>Cuando finalizas una compra te pedimos nombre, <strong>cédula o NIT</strong>, dirección, ciudad, teléfono y <strong>correo</strong>. La cédula (o el NIT de tu empresa) y el correo los usamos para expedir la <strong>factura electrónica</strong> y para el <strong>envío</strong>; el resto, para llevarte el pedido y contactarte si hay algo que aclarar. Esos datos <strong>no se guardan en este sitio web</strong>: se usan para armar el mensaje del pedido y se envían por <strong>WhatsApp</strong> al número de Lexmonn, donde quedan en esa conversación. No los usamos para nada distinto de tu compra. Ten en cuenta que WhatsApp es un servicio de Meta y tiene sus propias condiciones.</p>

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
        <p><button type="button" id="privacy-notice-reset" class="btn btn-dark btn-sm">Ver el aviso otra vez</button></p>

        <p class="legal-updated">Última actualización: 24 de septiembre de 2026.</p>
      </div>
    </div>
  </section>`;

  writeFile("privacidad.html", Shell.renderPage({ head, main }));
}

// ---------- 404 ----------

// GitHub Pages sirve /404.html automáticamente para cualquier ruta que no
// exista. Sin este archivo el visitante ve la página de error genérica de
// GitHub, sin logo ni forma de volver al catálogo.
function build404Page(cats) {
  const head = Shell.renderHead({
    title: "Página no encontrada | Lexmonn",
    description: "Esta página no existe. Explora el catálogo completo de porta herramientas y herramientas Lexmonn.",
    canonical: `${SITE_URL}/`,
    robots: "noindex, follow",
  });

  const catLinks = cats
    .map((c) => `<li><a class="chip" href="/categoria/${c.slug}.html">${esc(c.name)}</a></li>`)
    .join("");

  const main = `<section class="empty-page">
    <div class="container empty-page-inner">
      <p class="eyebrow">Error 404</p>
      <h1 class="page-title">Esta página no existe</h1>
      <p class="page-lead">Puede que el enlace esté mal escrito o que el producto haya cambiado de nombre.</p>
      <a class="btn btn-lime" href="/catalogo.html">${icon("arrowLeft", 20)} Ver el catálogo completo</a>
      ${catLinks ? `<p class="empty-page-sub">O ve directo a una categoría:</p><ul class="chip-list">${catLinks}</ul>` : ""}
    </div>
  </section>`;

  writeFile("404.html", Shell.renderPage({ head, main }));
}

// ---------- Categoría ----------

function buildCategoryPage(cat, allCats) {
  const { name: catName, slug: catSlug, products } = cat;
  const canonical = `${SITE_URL}/categoria/${catSlug}.html`;
  const title = `${catName} en Colombia | Lexmonn`;
  const description = Shared.truncateForMeta(cat.metaDescription, 160);

  const head = Shell.renderHead({
    title,
    description,
    canonical,
    ogImage: !cat.image ? undefined : /^https?:/.test(cat.image) ? cat.image : `${SITE_URL}${cat.image}`,
    ogImageAlt: catName,
    breadcrumbJsonLd: Templates.renderBreadcrumbJsonLd([
      { name: "Inicio", url: `${SITE_URL}/` },
      { name: catName, url: canonical },
    ]),
    extraJsonLd: [
      {
        // ItemList con la URL de cada producto: el formato que Google pide
        // para páginas de listado. Los datos completos de cada producto (precio,
        // marca, foto) viven en SU página, no repetidos aquí.
        id: "product-schema",
        json: {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: catName,
          numberOfItems: products.length,
          itemListElement: products.map((p, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            url: `${SITE_URL}/productos/${p.slug}.html`,
            name: p.nombre,
          })),
        },
      },
    ],
  });

  const breadcrumbs = Templates.renderBreadcrumbs([{ name: "Inicio", href: "/" }, { name: catName }]);

  // Marcas y precio de entrada se calculan del catálogo en cada build, así
  // que nunca quedan desactualizados.
  // En la de fabricación propia no se listan marcas: todo es Lexmonn, y un
  // producto de reventa cargado ahí por error la haría ver como "de marcas".
  // Tampoco la marca que ya está en el nombre de la categoría ("Herramientas
  // Total" no necesita decir "Marcas: Total"). La cantidad de productos no va
  // aquí: la dice la barra de la grilla, que además se actualiza al buscar.
  const brands = cat.insignia ? [] : cat.brands.filter((b) => b !== "Lexmonn" && !catName.includes(b));
  const facts = [cat.minPrice ? `Desde ${Shared.formatPrice(cat.minPrice)}` : "", "Envíos a toda Colombia"].filter(Boolean);

  // Sin pastillas de filtro arriba: estando DENTRO de una categoría, la lista
  // de las otras ocupa media pantalla de celular antes del primer producto y
  // le ofrece al visitante irse justo cuando acaba de elegir. Las otras
  // categorías van al FINAL de la página, donde ya terminó de mirar.
  const others = allCats
    .filter((c) => c.slug !== catSlug)
    .map((c) => `<li><a class="chip" href="/categoria/${c.slug}.html">${esc(c.name)}</a></li>`)
    .join("");

  const main = `<section class="page-hero${catName === "Porta Herramientas" ? " page-hero--own" : ""}">
    <div class="container">
      ${breadcrumbs}
      ${cat.insignia ? `<p class="eyebrow">${icon("factory", 16)} ${esc(cat.insignia)}</p>` : ""}
      <h1 class="page-title">${esc(catName)}</h1>
      <p class="page-lead">${esc(cat.intro)}</p>
      <ul class="page-facts">
        ${facts.map((f) => `<li>${esc(f)}</li>`).join("")}
        ${brands.length ? `<li>Marcas: ${esc(joinList(brands))}</li>` : ""}
      </ul>
    </div>
  </section>

  <section class="section section-tight" aria-label="Productos de ${esc(catName)}">
    <div class="container">
      ${renderCatalogToolbar(products.length)}
      <div id="catalog" class="product-grid">${products.map(Templates.renderProductCard).join("")}</div>
    </div>
  </section>

  ${others ? `<section class="section section-alt section-tight" aria-labelledby="other-cats-title">
    <div class="container">
      <h2 id="other-cats-title" class="section-title section-title-sm">Otras categorías</h2>
      <ul class="chip-list">${others}</ul>
    </div>
  </section>` : ""}`;

  writeFile(
    `categoria/${catSlug}.html`,
    Shell.renderPage({
      head,
      main,
      navCurrent: catSlug,
      bodyAttrs: `data-page="category" data-category="${esc(catName)}"`,
    })
  );
}

// ---------- Sitemap ----------

// Incluye las fotos de cada producto (extensión image de Google): así las
// imágenes se indexan en Google Imágenes asociadas a su página.
function buildSitemap(activeProducts, cats) {
  const today = new Date().toISOString().slice(0, 10);
  const xmlEsc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0", images: [`${SITE_URL}${HERO_IMAGE}`] },
    { loc: `${SITE_URL}/catalogo.html`, priority: "0.9" },
    ...cats.map((c) => ({ loc: `${SITE_URL}/categoria/${c.slug}.html`, priority: "0.8" })),
    ...activeProducts.map((p) => ({
      loc: `${SITE_URL}/productos/${p.slug}.html`,
      priority: "0.7",
      images: (p.imagenes && p.imagenes.length ? p.imagenes : [p.imagen]).filter(Boolean),
    })),
    { loc: `${SITE_URL}/privacidad.html`, priority: "0.2" },
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    urls
      .map((u) => {
        const imgs = (u.images || [])
          .map((src) => `\n    <image:image><image:loc>${xmlEsc(src)}</image:loc></image:image>`)
          .join("");
        return `  <url>\n    <loc>${xmlEsc(u.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${u.priority}</priority>${imgs}\n  </url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;
  writeFile("sitemap.xml", xml);
}

// ---------- llms.txt ----------

// Resumen en texto plano para asistentes de IA (ChatGPT, Gemini, Perplexity)
// que leen /llms.txt para entender de qué se trata un sitio y a dónde mandar
// a quien pregunta. Se regenera en cada build con las categorías vigentes.
function buildLlmsTxt(activeProducts, cats) {
  const lines = [
    "# Lexmonn",
    "",
    "> Lexmonn es una empresa colombiana de Bello, Antioquia, que fabrica porta herramientas (cinturones, morrales, bolsos, cargaderas y bolsillos) y vende herramientas para construcción y drywall de marcas como Total, Truper, DeWalt y Stanley. Los pedidos se arman en el sitio y se envían por WhatsApp; despacha a toda Colombia.",
    "",
    "## Datos del negocio",
    "",
    "- Dirección: Cll 54 cr 53-34, Bello, Antioquia, Colombia",
    "- WhatsApp y teléfono: +57 301 559 7873",
    "- Correo: lexmonn.admon@gmail.com",
    "- Horario: lunes a viernes 8:00 a.m. – 6:30 p.m.; sábados 9:00 a.m. – 3:00 p.m.",
    "- Envíos: a toda Colombia por transportadora",
    "- NIT: 901923669",
    "",
    "## Catálogo",
    "",
    `- [Todo el catálogo](${SITE_URL}/catalogo.html): ${activeProducts.length} productos`,
    ...cats.map((c) => `- [${c.name}](${SITE_URL}/categoria/${c.slug}.html): ${c.intro}`),
    "",
    "## Cómo comprar",
    "",
    "1. Agregar productos al carrito en lexmonn.com.",
    "2. Completar nombre, dirección, ciudad y teléfono; el sitio abre WhatsApp con el pedido armado.",
    "3. Lexmonn confirma disponibilidad, pago y envío por WhatsApp y despacha.",
    "",
    "## Otras páginas",
    "",
    `- [Privacidad y tratamiento de datos](${SITE_URL}/privacidad.html)`,
    `- [Mapa del sitio](${SITE_URL}/sitemap.xml)`,
    "",
  ];
  writeFile("llms.txt", lines.join("\n"));
}

function buildManifest() {
  const manifest = {
    name: "Lexmonn",
    short_name: "Lexmonn",
    description: "Porta herramientas fabricados en Colombia y herramientas para la obra.",
    lang: "es-CO",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#111614",
    icons: [
      { src: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
  };
  writeFile("site.webmanifest", JSON.stringify(manifest, null, 2) + "\n");
}

// ---------- Orquestación ----------

async function main() {
  console.log("[build] Descargando catálogo desde Google Sheets...");
  const csvText = await fetchCsv(CONFIG.SHEET_CSV_URL);
  const allRows = Shared.sortByNombre(
    Shared.parseCSV(csvText).map(Shared.normalizeProduct).filter((p) => p.id && p.nombre)
  );
  const activeProducts = allRows.filter((p) => Shared.isActive(p.activo));

  if (activeProducts.length === 0) {
    console.error(
      "[build] ABORTANDO: el CSV no tiene ningún producto activo válido. No se sobrescribió ningún archivo."
    );
    process.exit(1);
  }

  console.log(`[build] ${activeProducts.length} productos activos de ${allRows.length} filas totales.`);

  // Una foto nueva de la Sheet se publica igual con su original; solo avisa
  // que todavía no tiene versión liviana, para correr la herramienta.
  const sinVersion = [...new Set(activeProducts.flatMap((p) => p.imagenes))].filter(
    (url) => Shared.fotoClave(url) && !Shared.fotoVersiones(url, 400).optimizada
  );
  if (sinVersion.length) {
    console.log(`[build] ${sinVersion.length} fotos todavía sin versión liviana (se usa la original). Para generarlas: node tools/optimizar-fotos.js`);
  }

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

  const categoryMap = new Map();
  activeProducts.forEach((p) => {
    const cat = p.categoria || "Sin categoría";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat).push(p);
  });
  const cats = buildCategoryInfo(categoryMap);
  const catByName = new Map(cats.map((c) => [c.name, c]));

  Shell.configure({
    navCategories: cats.map((c) => ({ name: c.name, slug: c.slug })),
    assetVersions: computeAssetVersions(),
  });

  buildHomePage(activeProducts, cats);
  buildCatalogPage(activeProducts, allCategories);

  activeProducts.forEach((p) => buildProductPage(p, catByName.get(p.categoria || "Sin categoría")));

  // Productos desactivados en la Sheet (Activo = No) pero que siguen ahí:
  // se les avisa en su propia página en vez de dejarla con datos viejos.
  const inactivePresent = allRows.filter((p) => !Shared.isActive(p.activo) && p.slug);
  inactivePresent.forEach((p) => buildUnavailableProductPage(p.slug, p.nombre));

  // Páginas de producto que existían en un build anterior y ya no
  // corresponden a NINGUNA fila del CSV (se borró la fila por completo,
  // o el producto cambió de nombre y por lo tanto de slug).
  // Si es un producto que solo se renombró, la página vieja redirige a la nueva.
  const productsDir = path.join(ROOT, "productos");
  const presentSlugs = new Set(allRows.map((p) => p.slug));
  const activeById = new Map(activeProducts.map((p) => [p.id, p]));
  const activeByName = new Map(activeProducts.map((p) => [nombreDelSlug(p.slug), p]));
  let redirects = 0;
  if (fs.existsSync(productsDir)) {
    fs.readdirSync(productsDir)
      .filter((f) => f.endsWith(".html"))
      .map((f) => f.replace(/\.html$/, ""))
      .filter((slug) => !presentSlugs.has(slug))
      .forEach((slug) => {
        const target = findRenamedTarget(slug, activeById, activeByName);
        if (target) {
          buildRedirectPage(slug, target);
          redirects++;
        } else {
          buildUnavailableProductPage(slug, null);
        }
      });
  }
  if (redirects) console.log(`[build] ${redirects} URLs de productos renombrados redirigen a su página nueva.`);

  cats.forEach((cat) => buildCategoryPage(cat, cats));

  // Categorías que existían en un build anterior y ya no están en la Sheet.
  // A diferencia de los productos, una categoría retirada no tiene página
  // "lápida": si no se borra el archivo, sigue publicado e indexable con un
  // listado de productos que ya no existen.
  const categoriaDir = path.join(ROOT, "categoria");
  const slugsVigentes = new Set(cats.map((c) => c.slug));
  if (fs.existsSync(categoriaDir)) {
    fs.readdirSync(categoriaDir)
      .filter((f) => f.endsWith(".html"))
      .filter((f) => !slugsVigentes.has(f.replace(/\.html$/, "")))
      .forEach((f) => {
        fs.unlinkSync(path.join(categoriaDir, f));
        console.log(`[build] Categoría retirada del sitio: ${f}`);
      });
  }

  build404Page(cats);
  buildPrivacyPage();

  buildSitemap(activeProducts, cats);
  buildLlmsTxt(activeProducts, cats);
  buildManifest();

  console.log(
    `[build] Listo: index.html, catalogo.html, ${activeProducts.length} páginas de producto, ${cats.length} páginas de categoría, 404.html, privacidad.html, sitemap.xml, llms.txt.`
  );
}

main().catch((err) => {
  console.error("[build] Falló:", err.message);
  process.exit(1);
});
