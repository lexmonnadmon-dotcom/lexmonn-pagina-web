// ============================================================
// LEXMONN - "Cascarón" (chrome) de la página: todo lo que se repite
// en Home, páginas de producto y páginas de categoría (head, header,
// navegación, carrito, modales, footer, scripts). Solo lo usa build.js.
//
// Si quieres cambiar el header, el footer, la franja de aniversario
// o los modales del carrito a mano, este es el archivo que debes
// editar — index.html y las páginas de producto/categoría se
// regeneran a partir de aquí con `node build.js`.
// ============================================================

const { escapeHtml } = require("../lib/shared.js");
const { icon } = require("../lib/templates.js");

const SITE_URL = "https://lexmonn.com";
const WHATSAPP_URL = "https://wa.me/573015597873";
const PHONE_DISPLAY = "301 559 7873";
const EMAIL = "lexmonn.admon@gmail.com";
const ADDRESS = "Cll 54 cr 53-34, Bello, Antioquia";
const SOCIAL = {
  instagram: "https://www.instagram.com/lexmonn_sas?igsh=c3I3eGVrZ3F4OHRi",
  facebook: "https://www.facebook.com/share/18Bj6WAGWX/?mibextid=wwXIfr",
  tiktok: "https://www.tiktok.com/@lexmonn_sas",
};

// build.js llena esto antes de generar páginas: las categorías vigentes (para
// la barra de navegación y el pie) y la versión de cada archivo estático.
const state = {
  navCategories: [],
  assetVersions: {},
};

function configure(opts) {
  Object.assign(state, opts || {});
}

function asset(pathName) {
  const v = state.assetVersions[pathName];
  return v ? `${pathName}?v=${v}` : pathName;
}

// ---------- Datos estructurados de la empresa ----------
// Van SOLO en la portada: Google los lee de la home y no necesita el mismo
// bloque repetido en 160 páginas. Los productos apuntan a la organización
// por su @id.
const ORG_ID = `${SITE_URL}/#organization`;

const ORG_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "Lexmonn",
      alternateName: "Lexmonn Tool Holders",
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-cropped.png`, width: 874, height: 272 },
      image: `${SITE_URL}/favicon-192.png`,
      taxID: "901923669",
      email: EMAIL,
      telephone: "+57 301 559 7873",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        telephone: "+57 301 559 7873",
        areaServed: "CO",
        availableLanguage: "es",
      },
      sameAs: [SOCIAL.instagram, SOCIAL.facebook, SOCIAL.tiktok],
    },
    {
      // HardwareStore es el subtipo de LocalBusiness para ferreterías y
      // tiendas de herramientas: más preciso que LocalBusiness a secas.
      "@type": "HardwareStore",
      "@id": `${SITE_URL}/#store`,
      name: "Lexmonn",
      url: `${SITE_URL}/`,
      image: `${SITE_URL}/hero-banner-2.jpeg`,
      logo: `${SITE_URL}/logo-cropped.png`,
      telephone: "+57 301 559 7873",
      email: EMAIL,
      parentOrganization: { "@id": ORG_ID },
      address: {
        "@type": "PostalAddress",
        streetAddress: "Cll 54 cr 53-34",
        addressLocality: "Bello",
        addressRegion: "Antioquia",
        addressCountry: "CO",
      },
      areaServed: { "@type": "Country", name: "Colombia" },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "08:00",
          closes: "18:30",
        },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "09:00", closes: "15:00" },
      ],
    },
    {
      // Le dice a Google cómo se llama el sitio (el nombre que muestra encima
      // del resultado) y en qué idioma está.
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Lexmonn",
      alternateName: "Lexmonn Tool Holders",
      url: `${SITE_URL}/`,
      inLanguage: "es-CO",
      publisher: { "@id": ORG_ID },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/catalogo.html?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

function jsonLdScript(obj, id) {
  // JSON.stringify escapa comillas para que el JSON sea válido, pero no
  // escapa "<". Un valor con "</script>" (ej. el nombre de un producto)
  // cerraría este bloque a nivel del parser HTML y abriría uno nuevo,
  // ejecutable. < es indistinguible de "<" para JSON.parse, así que
  // esto no cambia el dato, solo impide que el HTML lo lea como una etiqueta.
  const json = JSON.stringify(obj).replace(/</g, "\\u003c");
  return `<script type="application/ld+json"${id ? ` id="${id}"` : ""}>${json}</script>`;
}

// Imágenes fijas del sitio (logo, ícono, promoción): se muestran en WebP
// desde imagenes/opt/sitio/ y, si ese archivo faltara, vuelven a la original.
const FIJA_ONERROR = "this.onerror=null;this.removeAttribute('srcset');this.src=this.dataset.orig";

// meta: {
//   title, description, canonical, ogImage, ogImageAlt, ogType, robots,
//   productPrice, breadcrumbJsonLd, extraJsonLd, includeOrg
// }
function renderHead(meta) {
  // title/description/ogImage llegan del nombre, descripción e imagen del
  // producto en la Sheet: sin escapar, un nombre con `</title>` o `">` rompe
  // el <head> de la página, que es lo primero que parsea el navegador.
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(meta.canonical);
  const ogImage = escapeHtml(meta.ogImage || `${SITE_URL}/hero-banner-2.jpeg`);
  const ogImageAlt = escapeHtml(meta.ogImageAlt || "Lexmonn — porta herramientas fabricados en Colombia");
  // max-image-preview:large deja que Google muestre las fotos de producto en
  // tamaño grande (Discover, imágenes); sin eso se limita a miniaturas.
  const robots = meta.robots || "index, follow, max-image-preview:large, max-snippet:-1";
  const ogType = meta.ogType || "website";

  // Cada entrada es un objeto JSON-LD normal, o {id, json} cuando el script
  // necesita un id para que app.js lo encuentre y lo actualice en vivo, en
  // vez de agregarle uno nuevo al lado.
  const extraJsonLd = (meta.extraJsonLd || [])
    .map((entry) => (entry && entry.json ? jsonLdScript(entry.json, entry.id) : jsonLdScript(entry)))
    .join("\n");

  const productMeta = meta.productPrice
    ? `<meta property="product:price:amount" content="${escapeHtml(String(meta.productPrice))}">
<meta property="product:price:currency" content="COP">
<meta property="product:availability" content="in stock">
<meta property="product:condition" content="new">`
    : "";

  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#111614">
<meta name="format-detection" content="telephone=no">

<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:alt" content="${ogImageAlt}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Lexmonn">
<meta property="og:locale" content="es_CO">
${productMeta}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">

<!-- Favicon. Google solo muestra el icono del sitio en sus resultados si es
     CUADRADO y de 48px o un múltiplo (48, 96, 192...). -->
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">
<link rel="apple-touch-icon" href="/favicon-192.png">
<link rel="manifest" href="/site.webmanifest">

<!-- La letra se sirve desde el propio sitio (fuentes/, licencia OFL). Desde
     Google Fonts obligaba a abrir dos conexiones más antes de dibujar nada.
     Se precargan los dos pesos que se ven apenas abre la página. -->
<link rel="preload" as="font" type="font/woff2" href="/fuentes/barlow-condensed-800.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fuentes/barlow-400.woff2" crossorigin>
<link rel="preconnect" href="https://docs.google.com">
<link rel="stylesheet" href="${asset("/style.css")}">

${meta.includeOrg ? jsonLdScript(ORG_GRAPH) : ""}
${meta.breadcrumbJsonLd ? jsonLdScript(meta.breadcrumbJsonLd) : ""}
${extraJsonLd}`;
}

// ---------- Encabezado ----------

function renderTopbar() {
  return `<div class="topbar">
  <div class="container topbar-inner">
    <p class="topbar-msg"><strong>¡Celebramos 5 años!</strong> <span class="topbar-long">Fabricando calidad y revolucionando la forma en que trabajas.</span></p>
    <ul class="topbar-links">
      <li class="topbar-hide-sm">${icon("truck", 16)} Envíos a toda Colombia</li>
      <li><a href="${WHATSAPP_URL}" target="_blank" rel="noopener">${icon("whatsapp", 16)} ${PHONE_DISPLAY}</a></li>
    </ul>
  </div>
</div>`;
}

// Barra de búsqueda. En las páginas que tienen catálogo filtra en vivo; en las
// demás (portada, producto, 404, privacidad) lleva a /catalogo.html?q=...
// El formulario funciona igual sin JavaScript: es un GET normal a esa URL.
function renderSearchForm() {
  return `<form id="search-form" class="search-bar" role="search" action="/catalogo.html" method="get">
      <label class="visually-hidden" for="search-input">Buscar productos</label>
      <span class="search-icon" aria-hidden="true">${icon("search", 18)}</span>
      <input type="search" id="search-input" name="q" class="search-input" placeholder="Buscar taladros, espátulas, cinturones…" autocomplete="off" enterkeyhint="search">
      <button type="button" id="search-clear" class="search-clear" aria-label="Borrar búsqueda" hidden>${icon("x", 16)}</button>
    </form>`;
}

function renderHeader() {
  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="Lexmonn, ir al inicio">
      <img class="brand-logo" src="/imagenes/opt/sitio/logo-lexmonn-296.webp" srcset="/imagenes/opt/sitio/logo-lexmonn-296.webp 296w, /imagenes/opt/sitio/logo-lexmonn-444.webp 444w" sizes="148px" data-orig="/logo-cropped.png" onerror="${FIJA_ONERROR}" alt="Lexmonn Tool Holders" width="296" height="92">
    </a>
    ${renderSearchForm()}
    <button id="cart-btn" class="cart-btn" type="button" aria-label="Abrir carrito">
      ${icon("cart", 22)}
      <span class="cart-btn-label">Carrito</span>
      <span id="cart-count" class="cart-count" aria-live="polite">0</span>
    </button>
  </div>
</header>`;
}

// Navegación por categorías en TODAS las páginas: además de ayudar al que
// compra, son enlaces internos hacia cada categoría desde las ~160 páginas
// del sitio, que es lo que le dice a Google cuáles son las páginas importantes.
function renderCategoryNav(currentSlug) {
  const cats = state.navCategories || [];
  if (!cats.length) return "";
  const links = cats
    .map(
      (c) =>
        `<li><a href="/categoria/${c.slug}.html"${c.slug === currentSlug ? ' aria-current="page"' : ""}${c.name === "Porta Herramientas" ? ' class="is-own"' : ""}>${escapeHtml(c.name)}</a></li>`
    )
    .join("");
  return `<nav class="cat-nav" aria-label="Categorías">
  <div class="container">
    <ul class="cat-nav-list">
      <li><a href="/catalogo.html"${currentSlug === "catalogo" ? ' aria-current="page"' : ""}>${icon("list", 16)} Todo el catálogo</a></li>
      ${links}
    </ul>
  </div>
</nav>`;
}

// ---------- Aviso de privacidad ----------
// NO es un banner de consentimiento, y es a propósito: este sitio no tiene
// analítica, ni píxeles, ni publicidad, así que no hay nada que el visitante
// pueda aceptar o rechazar. Poner "Aceptar" y "Rechazar" sería una elección
// falsa. Por eso es informativo, con un solo botón.
//
// El día que se agregue un rastreador de verdad, ESTO tiene que volverse un
// consentimiento real: dos opciones, guardadas, y el script cargando solo si
// el visitante acepta.
function renderPrivacyNotice() {
  return `<div id="privacy-notice" class="privacy-notice" hidden role="region" aria-label="Aviso de privacidad">
  <p class="privacy-notice-text">
    <strong>Tu privacidad.</strong> Guardamos tu carrito en este navegador para que no lo pierdas si cierras la página. <strong>No usamos cookies de publicidad ni de seguimiento</strong> y no compartimos tus datos con nadie. <a href="/privacidad.html">Ver el detalle</a>.
  </p>
  <button type="button" id="privacy-notice-ok" class="btn btn-dark btn-sm">Entendido</button>
</div>`;
}

// ---------- Pie de página ----------

function renderFooter() {
  const cats = (state.navCategories || [])
    .map((c) => `<li><a href="/categoria/${c.slug}.html">${escapeHtml(c.name)}</a></li>`)
    .join("");
  return `<footer class="site-footer">
  <div class="ruler" aria-hidden="true"></div>
  <div class="container footer-grid">
    <div class="footer-brand">
      <a href="/" class="footer-logo" aria-label="Lexmonn, ir al inicio">
        <img src="/imagenes/opt/sitio/lex-icono-112.webp" data-orig="/favicon-192.png" onerror="${FIJA_ONERROR}" alt="" width="56" height="56" loading="lazy" decoding="async">
        <span>Lexmonn</span>
      </a>
      <p>Porta herramientas fabricados en Colombia y herramienta de las marcas que ya conoces para la obra. Desde Bello, Antioquia, hace cinco años.</p>
      <ul class="footer-social" aria-label="Redes sociales">
        <li><a href="${SOCIAL.instagram}" target="_blank" rel="noopener" aria-label="Instagram de Lexmonn">${icon("instagram")}</a></li>
        <li><a href="${SOCIAL.facebook}" target="_blank" rel="noopener" aria-label="Facebook de Lexmonn">${icon("facebook")}</a></li>
        <li><a href="${SOCIAL.tiktok}" target="_blank" rel="noopener" aria-label="TikTok de Lexmonn">${icon("tiktok")}</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h2 class="footer-title">Categorías</h2>
      <ul class="footer-links">
        <li><a href="/catalogo.html">Todo el catálogo</a></li>
        ${cats}
      </ul>
    </div>
    <div class="footer-col">
      <h2 class="footer-title">Contacto</h2>
      <ul class="footer-contact">
        <li>${icon("whatsapp", 18)} <a href="${WHATSAPP_URL}" target="_blank" rel="noopener">WhatsApp ${PHONE_DISPLAY}</a></li>
        <li>${icon("mail", 18)} <a href="mailto:${EMAIL}">${EMAIL}</a></li>
        <li>${icon("pin", 18)} <span id="store-location">${ADDRESS}</span></li>
      </ul>
    </div>
    <div class="footer-col">
      <h2 class="footer-title">Horarios</h2>
      <ul class="footer-contact">
        <li>${icon("clock", 18)} <span>Lunes a viernes<br>8:00 a.m. – 6:30 p.m.</span></li>
        <li>${icon("clock", 18)} <span>Sábados<br>9:00 a.m. – 3:00 p.m.</span></li>
        <li>${icon("truck", 18)} <span>Envíos a toda Colombia</span></li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>© <span id="year">2026</span> Lexmonn · NIT 901923669</p>
    <p><a href="/privacidad.html">Privacidad y tratamiento de datos</a></p>
  </div>
</footer>`;
}

// ---------- Carrito, pedido, visor de imagen y promoción ----------

function renderCartAndModals() {
  return `
<div id="cart-overlay" class="overlay" hidden></div>
<aside id="cart-panel" class="cart-panel" hidden aria-labelledby="cart-title" role="dialog" aria-modal="true">
  <div class="cart-panel-header">
    <h2 id="cart-title">Tu pedido</h2>
    <button id="cart-close" class="icon-btn" type="button" aria-label="Cerrar carrito">${icon("x", 22)}</button>
  </div>
  <div id="cart-items" class="cart-items"></div>
  <div class="cart-summary">
    <div class="cart-total-row">
      <span>Total</span>
      <span id="cart-total">$0</span>
    </div>
    <p class="cart-note">${icon("check", 16)} Te confirmamos disponibilidad y envío por WhatsApp antes de despachar.</p>
    <button id="checkout-btn" class="btn btn-lime btn-block" type="button" disabled>${icon("whatsapp", 20)} Finalizar pedido por WhatsApp</button>
  </div>
</aside>

<div id="checkout-overlay" class="overlay" hidden></div>
<div id="checkout-modal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="checkout-title">
  <div class="modal-header">
    <h2 id="checkout-title">Datos para tu pedido</h2>
    <button id="checkout-close" class="icon-btn" type="button" aria-label="Cerrar">${icon("x", 22)}</button>
  </div>
  <p class="modal-intro">Con estos datos armamos el mensaje del pedido. La cédula (o el NIT de tu empresa) y el correo son para la factura electrónica y el envío. El sitio no los guarda: van solo en tu mensaje de WhatsApp.</p>
  <form id="checkout-form" novalidate>
    <label class="field">
      <span class="field-label">Nombre completo <span aria-hidden="true">*</span></span>
      <input type="text" name="nombre" required autocomplete="name">
    </label>
    <label class="field">
      <span class="field-label">Cédula o NIT <span aria-hidden="true">*</span></span>
      <input type="text" name="cedula" required inputmode="numeric" autocomplete="off">
    </label>
    <label class="field">
      <span class="field-label">Dirección de entrega <span aria-hidden="true">*</span></span>
      <input type="text" name="direccion" required autocomplete="street-address">
    </label>
    <label class="field">
      <span class="field-label">Ciudad / Municipio <span aria-hidden="true">*</span></span>
      <input type="text" name="ciudad" required autocomplete="address-level2">
    </label>
    <label class="field">
      <span class="field-label">Número de teléfono <span aria-hidden="true">*</span></span>
      <input type="tel" name="telefono" required autocomplete="tel" inputmode="tel">
    </label>
    <label class="field">
      <span class="field-label">Correo electrónico <span aria-hidden="true">*</span></span>
      <input type="email" name="correo" required autocomplete="email" inputmode="email">
    </label>
    <p id="checkout-error" class="form-error" role="alert" hidden></p>
    <button type="submit" class="btn btn-lime btn-block">${icon("whatsapp", 20)} Enviar pedido por WhatsApp</button>
  </form>
</div>

<button id="cart-fab" class="cart-fab" type="button" hidden aria-label="Abrir carrito">
  ${icon("cart", 22)} <span id="cart-fab-count">0</span>
</button>

<div id="image-lightbox" class="image-lightbox" hidden role="dialog" aria-modal="true" aria-label="Foto ampliada">
  <button id="lightbox-close" class="icon-btn lightbox-close" type="button" aria-label="Cerrar">${icon("x", 24)}</button>
  <p id="lightbox-hint" class="lightbox-hint">Toca la imagen para hacer zoom</p>
  <img id="lightbox-img" class="lightbox-img" alt="">
</div>

<div id="promo-overlay" class="overlay" hidden></div>
<div id="promo-modal" class="promo-modal" hidden role="dialog" aria-modal="true" aria-label="Promoción de aniversario">
  <button id="promo-close" class="icon-btn promo-modal-close" type="button" aria-label="Cerrar">${icon("x", 22)}</button>
  <a href="${WHATSAPP_URL}?text=Hola%2C%20quiero%20m%C3%A1s%20informaci%C3%B3n%20sobre%20la%20promoci%C3%B3n%20de%20aniversario%20de%20Lexmonn" target="_blank" rel="noopener">
    <!-- Sin src a propósito: loading="lazy" no impedía que el navegador la
         bajara en TODAS las páginas aunque el pop-up no fuera a salir.
         app.js (abrirPromo) le pone src y srcset justo antes de mostrarla. -->
    <img data-src="/imagenes/opt/sitio/promo-sorteo-480.webp" data-srcset="/imagenes/opt/sitio/promo-sorteo-480.webp 480w, /imagenes/opt/sitio/promo-sorteo-720.webp 720w, /imagenes/opt/sitio/promo-sorteo-960.webp 960w" sizes="(min-width: 492px) 460px, calc(100vw - 32px)" data-orig="/promo-sorteo.jpeg" onerror="${FIJA_ONERROR}" alt="Promoción de aniversario Lexmonn" class="promo-modal-img" width="960" height="960" decoding="async">
  </a>
</div>`;
}

// `defer` mantiene el orden de ejecución y no bloquea el dibujo de la página.
// fotos-optimizadas.js va antes que shared.js, que lee su lista.
function renderScripts() {
  return ["/config.js", "/sample-products.js", "/lib/fotos-optimizadas.js", "/lib/shared.js", "/lib/templates.js", "/app.js"]
    .map((src) => `<script src="${asset(src)}" defer></script>`)
    .join("\n");
}

// opts: { head, bodyAttrs, main, navCurrent }
function renderPage(opts) {
  return `<!DOCTYPE html>
<html lang="es-CO">
<head>
${opts.head}
</head>
<body${opts.bodyAttrs ? " " + opts.bodyAttrs : ""}>
<a class="skip-link" href="#main">Saltar al contenido</a>

${renderTopbar()}
${renderHeader()}
${renderCategoryNav(opts.navCurrent)}

<main id="main">
${opts.main}
</main>

${renderFooter()}

${renderPrivacyNotice()}

${renderCartAndModals()}

${renderScripts()}
</body>
</html>
`;
}

module.exports = {
  SITE_URL,
  WHATSAPP_URL,
  PHONE_DISPLAY,
  EMAIL,
  ADDRESS,
  ORG_GRAPH,
  configure,
  asset,
  jsonLdScript,
  renderHead,
  renderHeader,
  renderPrivacyNotice,
  renderFooter,
  renderCartAndModals,
  renderScripts,
  renderPage,
};
