// ============================================================
// LEXMONN - Lógica del catálogo, carrito y pedido por WhatsApp
// No necesitas editar este archivo. Para configurar la tienda, ve a config.js
//
// La lógica de parseo/precios vive en lib/shared.js (compartida con
// build.js) y las plantillas de HTML en lib/templates.js — ambos se
// cargan antes que este archivo, así que sus funciones ya están
// disponibles aquí directamente (escapeHtml, parseCSV, hasDiscount,
// formatPrice, etc. y LexmonnTemplates.renderProductCard, etc.)
// ============================================================

const CART_STORAGE_KEY = "lexmonn_cart";
const PROMO_STORAGE_KEY = "lexmonn_promo_shown";
// Cada cuánto se le puede volver a mostrar el pop-up al mismo visitante.
const PROMO_REPETIR_MS = 24 * 60 * 60 * 1000;
const PRIVACY_NOTICE_KEY = "lexmonn_aviso_visto";

// Dominio del sitio, fijo a propósito y no `location.origin`: este valor solo
// se usa para los enlaces que van dentro del pedido de WhatsApp, y quien lo
// recibe debe poder abrirlos siempre. Con location.origin, un pedido hecho
// desde una vista previa local llegaría con enlaces a localhost.
const SITIO_URL = "https://lexmonn.com";

const icon = (name, size) => LexmonnTemplates.icon(name, size);

let PRODUCTS = [];
let cart = loadCart();
let activeCategory = (document.body && document.body.dataset.category) || "Todos";
let searchTerm = "";
let sortMode = "nombre";

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  const locationEl = document.getElementById("store-location");
  if (locationEl && CONFIG.STORE_LOCATION) locationEl.textContent = CONFIG.STORE_LOCATION;

  revealCurrentNavItem();
  bindGlobalEvents();
  initSearch();
  initSort();
  initStaticProductDetail();
  initOffers();
  // Las ofertas se re-dibujan cuando llega la Sheet en vivo, para que un
  // descuento puesto después del último build aparezca igual.
  loadCatalog().then(renderOffers);
  renderCart();
  initPrivacyNotice();
  initPromoPopup();
});

// En celular la barra de categorías se desliza de lado: si la categoría
// actual quedó fuera de la pantalla, se corre hasta ella (solo en horizontal,
// sin mover la página).
function revealCurrentNavItem() {
  const list = document.querySelector(".cat-nav-list");
  const current = list && list.querySelector('a[aria-current="page"]');
  if (!current) return;
  const item = current.parentElement;
  if (item.offsetLeft + item.offsetWidth > list.clientWidth) {
    list.scrollLeft = item.offsetLeft - 16;
  }
}

// ---------- Paneles y modales: scroll, Escape y foco ----------
// Bloquea el scroll de fondo mientras hay algo abierto, para que al llegar al
// final del carrito (en especial en celular) el navegador no "empuje" el
// catálogo de atrás. Usa un contador porque a veces un panel abre a otro.
let openOverlaysCount = 0;
function lockBodyScroll() {
  openOverlaysCount++;
  document.body.style.overflow = "hidden";
}
function unlockBodyScroll() {
  openOverlaysCount = Math.max(0, openOverlaysCount - 1);
  if (openOverlaysCount === 0) document.body.style.overflow = "";
}

// Pila de lo que está abierto, para que Escape cierre lo de más arriba y el
// foco vuelva al botón que lo abrió.
const openStack = [];
function pushOpen(closeFn, focusTarget) {
  openStack.push({ closeFn, returnTo: document.activeElement });
  if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
}
function popOpen(closeFn) {
  const idx = openStack.findIndex((e) => e.closeFn === closeFn);
  if (idx === -1) return;
  const [entry] = openStack.splice(idx, 1);
  if (entry.returnTo && typeof entry.returnTo.focus === "function" && document.contains(entry.returnTo)) {
    entry.returnTo.focus();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openStack.length) {
    openStack[openStack.length - 1].closeFn();
  }
});

// ---------- Pop-up de promoción ----------
//
// La marca de "ya se mostró" vive en localStorage y no en sessionStorage,
// porque sessionStorage es POR PESTAÑA: al abrir un producto en una pestaña
// nueva la pestaña arranca sin la marca y el pop-up volvía a salir en cada
// producto. Se guarda la FECHA y se deja volver a mostrar pasado un día.

function promoYaSeMostro() {
  try {
    const marca = Number(localStorage.getItem(PROMO_STORAGE_KEY));
    return marca > 0 && Date.now() - marca < PROMO_REPETIR_MS;
  } catch {
    // Sin almacenamiento se mostrará de nuevo: preferible a no mostrarlo.
    return false;
  }
}

function marcarPromoMostrado() {
  try {
    localStorage.setItem(PROMO_STORAGE_KEY, String(Date.now()));
  } catch {
    // navegador con almacenamiento bloqueado
  }
}

function initPromoPopup() {
  document.getElementById("promo-close").addEventListener("click", closePromoPopup);
  document.getElementById("promo-overlay").addEventListener("click", closePromoPopup);

  if (promoYaSeMostro()) return;

  // Sale cuando la página terminó de cargar, y nunca antes de 1,2 s: antes
  // salía a los 1,2 s fijos y su imagen le quitaba conexión a la foto
  // principal justo mientras cargaba, que es lo que Google mide (LCP). En
  // una conexión rápida sigue saliendo a los 1,2 s como siempre.
  const inicio = Date.now();
  const programar = () => setTimeout(abrirPromo, Math.max(500, 1200 - (Date.now() - inicio)));
  if (document.readyState === "complete") programar();
  else window.addEventListener("load", programar, { once: true });
}

async function abrirPromo() {
  // Se vuelve a comprobar justo antes de mostrarlo: si el cliente abrió
  // varias pestañas casi a la vez, la primera en aparecer deja la marca.
  if (promoYaSeMostro()) return;
  const modal = document.getElementById("promo-modal");
  // La imagen se baja y decodifica antes de abrir, para que el cuadro no
  // aparezca vacío y se rellene (y salte) un momento después.
  // Con tope de 3 s: en una pestaña que está en segundo plano el navegador
  // puede no decodificar hasta que se la mire, y el pop-up no debe quedar
  // esperando para siempre.
  const img = modal.querySelector("img");
  if (img) {
    // El HTML la trae sin src para que no se baje en cada página; recién
    // ahora que el pop-up va a salir se le pone la dirección.
    if (!img.getAttribute("src") && img.dataset.src) {
      img.srcset = img.dataset.srcset || "";
      img.src = img.dataset.src;
    }
    const tope = new Promise((resolve) => setTimeout(resolve, 3000));
    // si la versión liviana falla, onerror pasa a la original: se abre igual
    await Promise.race([img.decode().catch(() => {}), tope]);
  }
  if (promoYaSeMostro()) return;
  marcarPromoMostrado();
  modal.hidden = false;
  document.getElementById("promo-overlay").hidden = false;
  lockBodyScroll();
  pushOpen(closePromoPopup, document.getElementById("promo-close"));
}

function closePromoPopup() {
  const modal = document.getElementById("promo-modal");
  if (modal.hidden) return;
  modal.hidden = true;
  document.getElementById("promo-overlay").hidden = true;
  unlockBodyScroll();
  popOpen(closePromoPopup);
}

// ---------- Aviso de privacidad ----------
//
// Es un aviso INFORMATIVO, no un consentimiento, y es a propósito: este
// sitio no tiene analítica, ni píxeles, ni publicidad. Lo único que se
// guarda es el carrito, que es estrictamente necesario para que la tienda
// funcione. No hay nada que el visitante pueda aceptar o rechazar.
//
// El día que se agregue Google Analytics, Meta Pixel o similar, esto tiene
// que convertirse en un consentimiento de verdad (y hay que reescribir este
// texto y /privacidad.html, que hoy afirman que no existe seguimiento).

function initPrivacyNotice() {
  const notice = document.getElementById("privacy-notice");
  if (!notice) return;

  let yaVisto = null;
  try {
    yaVisto = localStorage.getItem(PRIVACY_NOTICE_KEY);
  } catch {
    // se mostrará el aviso otra vez, preferible a no mostrarlo nunca
  }
  if (!yaVisto) notice.hidden = false;

  // Mientras el aviso está abajo, el botón flotante del carrito sube justo
  // por encima: la altura del aviso cambia con el ancho de la pantalla.
  const syncNoticeOffset = () => {
    if (!notice.hidden) {
      document.documentElement.style.setProperty("--notice-offset", `${notice.offsetHeight + 28}px`);
    }
  };
  syncNoticeOffset();
  window.addEventListener("resize", syncNoticeOffset);

  const okBtn = document.getElementById("privacy-notice-ok");
  if (okBtn) {
    okBtn.addEventListener("click", () => {
      notice.hidden = true;
      try {
        localStorage.setItem(PRIVACY_NOTICE_KEY, "1");
      } catch {
        // sin almacenamiento se volverá a mostrar en la próxima visita
      }
    });
  }

  // Botón de /privacidad.html para volver a ver el aviso.
  const resetBtn = document.getElementById("privacy-notice-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem(PRIVACY_NOTICE_KEY);
      } catch {
        // no hay nada guardado que borrar
      }
      window.location.reload();
    });
  }
}

// ---------- Buscador ----------

// Compara sin tildes ni mayúsculas, para que "percutor" encuentre
// "Percutor" y "bateria" encuentre "batería".
const DIACRITICS_RE = new RegExp("[̀-ͯ]", "g");

function normalizeText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "");
}

function productMatchesSearch(p, term) {
  if (!term) return true;
  const haystack = normalizeText([p.nombre, p.descripcion, p.categoria, p.marca].join(" "));
  return normalizeText(term)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function initSearch() {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");
  if (!form || !input || !clearBtn) return;

  // La portada, las páginas de producto, la 404 y privacidad no tienen
  // catálogo que filtrar: ahí el buscador manda a /catalogo.html con ?q=,
  // que sí lo lee al cargar. Sin JavaScript el formulario hace lo mismo.
  const hasCatalog = !!document.getElementById("catalog");

  const initial = (new URLSearchParams(window.location.search).get("q") || "").trim();
  if (initial) {
    input.value = initial;
    searchTerm = initial;
  }
  clearBtn.hidden = !input.value;

  form.addEventListener("submit", (e) => {
    if (!hasCatalog) return; // deja que el GET normal vaya a /catalogo.html?q=
    e.preventDefault();
    input.blur(); // en celular, cierra el teclado y deja ver los resultados
  });

  input.addEventListener("input", () => {
    clearBtn.hidden = !input.value;
    if (!hasCatalog) return;
    searchTerm = input.value.trim();
    applySearch();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.hidden = true;
    searchTerm = "";
    if (hasCatalog) applySearch();
    input.focus();
  });

  if (initial && hasCatalog) applySearch();
}

function applySearch() {
  // Con una búsqueda activa, la presentación de la página ("17 productos,
  // desde $7.000") quedaría encima de un solo resultado: se esconde por CSS.
  document.body.classList.toggle("searching", Boolean(searchTerm));

  // Si la Sheet ya cargó, se re-dibuja el catálogo desde los datos. Si el
  // visitante alcanzó a escribir antes (las páginas vienen pre-renderizadas
  // y se ven al instante), se filtran las tarjetas que ya están en pantalla.
  if (PRODUCTS.length) {
    renderCatalog();
  } else {
    filterPrerenderedCards();
  }
}

function filterPrerenderedCards() {
  const catalogEl = document.getElementById("catalog");
  if (!catalogEl) return;
  const term = normalizeText(searchTerm);
  let visible = 0;
  catalogEl.querySelectorAll(".product-card").forEach((card) => {
    const match = !term || normalizeText(card.textContent).includes(term);
    card.hidden = !match;
    if (match) visible++;
  });
  updateResultCount(visible);
  renderSearchEmptyState(visible);
}

function updateResultCount(n) {
  const el = document.getElementById("result-count");
  if (!el) return;
  el.textContent = searchTerm
    ? `${n} ${n === 1 ? "resultado" : "resultados"} para “${searchTerm}”`
    : `${n} ${n === 1 ? "producto" : "productos"}`;
}

function renderSearchEmptyState(visibleCount) {
  const catalogEl = document.getElementById("catalog");
  if (!catalogEl) return;

  const existing = document.getElementById("search-empty");
  if (visibleCount > 0 || !searchTerm) {
    if (existing) existing.remove();
    return;
  }

  const el = existing || document.createElement("div");
  el.id = "search-empty";
  el.className = "search-empty";
  el.innerHTML = `${icon("search", 32)}
    <p>No encontramos productos para <strong>“${escapeHtml(searchTerm)}”</strong>.</p>
    <p>Prueba con otra palabra, o <button type="button" id="search-empty-reset" class="text-btn text-btn-inline">ve todo el catálogo</button>.</p>`;
  if (!existing) catalogEl.insertAdjacentElement("afterend", el);

  document.getElementById("search-empty-reset").addEventListener("click", () => {
    const input = document.getElementById("search-input");
    const clearBtn = document.getElementById("search-clear");
    if (input) input.value = "";
    if (clearBtn) clearBtn.hidden = true;
    searchTerm = "";
    applySearch();
  });
}

// ---------- Orden ----------

function sortProducts(list) {
  if (sortMode === "precio-asc") return [...list].sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
  if (sortMode === "precio-desc") return [...list].sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  return sortByNombre(list);
}

function initSort() {
  const select = document.getElementById("sort-select");
  if (!select) return;
  select.addEventListener("change", () => {
    sortMode = select.value;
    if (PRODUCTS.length) {
      renderCatalog();
    } else {
      sortPrerenderedCards();
    }
  });
}

// Antes de que llegue la Sheet, ordena las tarjetas que ya están en pantalla
// usando el precio que el build dejó en cada una (data-price).
function sortPrerenderedCards() {
  const catalogEl = document.getElementById("catalog");
  if (!catalogEl) return;
  const cards = [...catalogEl.querySelectorAll(".product-card")];
  const name = (c) => (c.querySelector(".product-name") || {}).textContent || "";
  cards.sort((a, b) => {
    if (sortMode === "precio-asc") return Number(a.dataset.price) - Number(b.dataset.price);
    if (sortMode === "precio-desc") return Number(b.dataset.price) - Number(a.dataset.price);
    return name(a).localeCompare(name(b), "es", { sensitivity: "base" });
  });
  cards.forEach((c) => catalogEl.appendChild(c));
}

// ---------- Carga del catálogo desde Google Sheets ----------

// Cachea la respuesta del CSV en el navegador, pero la renueva cada 5 minutos:
// el parámetro "v" cambia por bloques de tiempo, así que dentro de esos 5
// minutos las recargas usan la caché normal (más rápido) y, pasado ese tiempo,
// la URL cambia y fuerza una descarga fresca.
const SHEET_CACHE_BUCKET_MS = 5 * 60 * 1000;

function getSheetUrl() {
  const bucket = Math.floor(Date.now() / SHEET_CACHE_BUCKET_MS);
  const sep = CONFIG.SHEET_CSV_URL.includes("?") ? "&" : "?";
  return `${CONFIG.SHEET_CSV_URL}${sep}v=${bucket}`;
}

function fallbackProducts() {
  return sortByNombre(FALLBACK_PRODUCTS.filter((p) => p.id && isActive(p.activo)));
}

async function loadCatalog() {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const noticeEl = document.getElementById("sample-notice");
  const catalogEl = document.getElementById("catalog");
  // Si el HTML ya trae tarjetas de producto (pre-renderizadas por build.js),
  // nunca las reemplazamos por el catálogo de ejemplo si el fetch en vivo
  // falla — solo lo usamos cuando no hay nada real que mostrar todavía.
  const hasPrerendered = !!(catalogEl && catalogEl.children.length > 0);

  const sheetConfigured = CONFIG.SHEET_CSV_URL && !CONFIG.SHEET_CSV_URL.includes("PEGAR_AQUI");

  if (!sheetConfigured) {
    if (loadingEl) loadingEl.hidden = true;
    PRODUCTS = fallbackProducts();
    if (!hasPrerendered) {
      if (noticeEl) noticeEl.hidden = false;
      if (catalogEl) renderCatalog();
    }
    renderCart();
    return;
  }

  if (!hasPrerendered && loadingEl) loadingEl.hidden = false;

  try {
    const res = await fetch(getSheetUrl(), { cache: "default" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const csvText = await res.text();
    const parsed = sortByNombre(
      parseCSV(csvText)
        .map(normalizeProduct)
        .filter((p) => p.id && isActive(p.activo))
    );

    if (loadingEl) loadingEl.hidden = true;

    if (parsed.length === 0) {
      if (!hasPrerendered) {
        if (noticeEl) noticeEl.hidden = false;
        PRODUCTS = fallbackProducts();
        if (catalogEl) renderCatalog();
      }
      renderCart();
      return;
    }

    PRODUCTS = parsed;
    if (catalogEl) renderCatalog();
    hydrateProductDetail();
    renderCart();
  } catch (err) {
    console.error("Error cargando catálogo desde Google Sheets:", err);
    if (loadingEl) loadingEl.hidden = true;
    if (!hasPrerendered) {
      if (errorEl) errorEl.hidden = false;
      PRODUCTS = fallbackProducts();
      if (catalogEl) renderCatalog();
    }
    renderCart();
  }
}

// ---------- Render del catálogo ----------

function getCategories() {
  const seen = [];
  PRODUCTS.forEach((p) => {
    const cat = p.categoria || "Sin categoría";
    if (!seen.includes(cat)) seen.push(cat);
  });
  return seen;
}

function renderCategoryFilters() {
  const filtersEl = document.getElementById("category-filters");
  if (!filtersEl) return;

  // Con una búsqueda activa se busca en todo el catálogo, así que dejar una
  // pastilla de categoría marcada como "activa" sería mentira: se ocultan.
  if (searchTerm) {
    filtersEl.hidden = true;
    return;
  }

  const categories = getCategories();

  if (categories.length <= 1) {
    filtersEl.hidden = true;
    filtersEl.innerHTML = "";
    return;
  }

  if (!categories.includes(activeCategory) && activeCategory !== "Todos") {
    activeCategory = "Todos";
  }

  filtersEl.hidden = false;
  const pill = (cat, label) =>
    `<button type="button" class="filter-pill${activeCategory === cat ? " active" : ""}" data-cat="${escapeHtml(cat)}" aria-pressed="${activeCategory === cat}">${escapeHtml(label)}</button>`;
  filtersEl.innerHTML = pill("Todos", "Todos") + categories.map((cat) => pill(cat, cat)).join("");

  filtersEl.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderCatalog();
    });
  });
}

// ItemList con la URL de cada producto visible: el formato que Google pide
// para listados. Los datos completos de cada producto viven en su página.
function injectProductSchema(products) {
  let script = document.getElementById("product-schema");
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "product-schema";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: products.length,
    itemListElement: products.map((p, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITIO_URL}/productos/${p.slug}.html`,
      name: p.nombre,
    })),
  });
}

function renderCatalog() {
  renderCategoryFilters();

  const catalogEl = document.getElementById("catalog");
  if (!catalogEl) return;

  // Con búsqueda activa se busca en TODO el catálogo, no solo dentro de la
  // categoría abierta: quien escribe "martillo" estando en Porta Herramientas
  // espera encontrarlo igual.
  const filtered = searchTerm
    ? PRODUCTS.filter((p) => productMatchesSearch(p, searchTerm))
    : activeCategory === "Todos"
      ? PRODUCTS
      : PRODUCTS.filter((p) => (p.categoria || "Sin categoría") === activeCategory);
  const visibleProducts = sortProducts(filtered);

  injectProductSchema(visibleProducts);

  catalogEl.innerHTML = visibleProducts.map(LexmonnTemplates.renderProductCard).join("");

  updateResultCount(visibleProducts.length);
  renderSearchEmptyState(visibleProducts.length);
}

// ---------- Carrusel "Ofertas de Aniversario" ----------

function renderOffers() {
  const section = document.getElementById("offers");
  const track = document.getElementById("offers-track");
  if (!section || !track) return;

  const offers = LexmonnTemplates.getOfferProducts(PRODUCTS);
  section.hidden = offers.length === 0;
  track.innerHTML = offers.map((p) => LexmonnTemplates.renderProductCard(p, { sizes: LexmonnTemplates.SIZES.oferta })).join("");
  track.scrollLeft = 0;
  updateOffersArrows();
}

// Las flechas solo aparecen si de verdad hay a dónde desplazarse, y cada una
// se esconde al llegar a su extremo. En celular se desliza con el dedo.
function updateOffersArrows() {
  const track = document.getElementById("offers-track");
  const prev = document.getElementById("offers-prev");
  const next = document.getElementById("offers-next");
  if (!track || !prev || !next) return;

  const maxScroll = track.scrollWidth - track.clientWidth;
  const desplazable = maxScroll > 4;
  prev.hidden = !desplazable || track.scrollLeft <= 2;
  next.hidden = !desplazable || track.scrollLeft >= maxScroll - 2;
}

function initOffers() {
  const track = document.getElementById("offers-track");
  if (!track) return;

  // Avanza de a dos tarjetas, medidas en vivo para que siga funcionando si
  // cambia el ancho de la tarjeta o el tamaño de la ventana.
  const paso = () => {
    const card = track.querySelector(".product-card");
    const ancho = card ? card.getBoundingClientRect().width : 240;
    return (ancho + 16) * 2;
  };

  document.getElementById("offers-prev").addEventListener("click", () => {
    track.scrollBy({ left: -paso(), behavior: "smooth" });
  });
  document.getElementById("offers-next").addEventListener("click", () => {
    track.scrollBy({ left: paso(), behavior: "smooth" });
  });

  track.addEventListener("scroll", updateOffersArrows, { passive: true });
  window.addEventListener("resize", updateOffersArrows);
  updateOffersArrows();
}

// ---------- Agregar al carrito ----------
// Un solo manejador para TODOS los botones "Agregar" del sitio (catálogo,
// ofertas, relacionados, página de producto), incluso los que se dibujan
// después con la Sheet en vivo. La cantidad sale del campo que indique
// data-qty-input; si no hay, se agrega una unidad.
function handleAddClick(e) {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const input = btn.dataset.qtyInput ? document.getElementById(btn.dataset.qtyInput) : null;
  const qty = Math.max(1, parseInt(input && input.value, 10) || 1);
  addToCart(btn.dataset.add, qty);

  // Confirmación visible en el propio botón, sin depender de abrir el carrito.
  if (!btn.classList.contains("is-added")) {
    btn.classList.add("is-added");
    setTimeout(() => btn.classList.remove("is-added"), 1400);
  }
}

// ---------- Página estática de producto (/productos/slug.html) ----------

function initStaticProductDetail() {
  if (!document.body || document.body.dataset.page !== "product") return;

  const qtyInput = document.getElementById("product-modal-qty");
  document.querySelectorAll("[data-qty-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = (parseInt(qtyInput.value, 10) || 1) + Number(btn.dataset.qtyStep);
      qtyInput.value = Math.max(1, Math.min(999, next));
    });
  });

  const shareBtn = document.getElementById("product-share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => shareCurrentProduct(shareBtn));
  }

  const mainImg = document.getElementById("product-modal-img");
  const thumbsEl = document.getElementById("product-modal-thumbs");
  const zoomBtn = document.getElementById("zoom-btn");
  // Al ampliar se abre data-full: la foto en su resolución completa, que es
  // donde el cliente quiere ver el detalle (ver fotoVersiones en shared.js).
  const ampliar = () => openLightbox(mainImg.dataset.full || mainImg.currentSrc || mainImg.src, mainImg.alt);
  if (mainImg) {
    mainImg.addEventListener("click", ampliar);
  }
  if (zoomBtn && mainImg) {
    zoomBtn.addEventListener("click", ampliar);
  }
  if (thumbsEl && mainImg) {
    thumbsEl.querySelectorAll(".gallery-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        // srcset primero: si quedara el de la foto anterior, el navegador
        // seguiría mostrando esa aunque cambie src.
        if (thumb.dataset.srcset) {
          mainImg.srcset = thumb.dataset.srcset;
          mainImg.dataset.orig = thumb.dataset.orig;
        } else {
          mainImg.removeAttribute("srcset");
          delete mainImg.dataset.orig;
        }
        mainImg.src = thumb.dataset.src;
        mainImg.dataset.full = thumb.dataset.full;
        thumbsEl.querySelectorAll(".gallery-thumb").forEach((t) => {
          t.classList.remove("active");
          t.removeAttribute("aria-current");
        });
        thumb.classList.add("active");
        thumb.setAttribute("aria-current", "true");
      });
    });
  }
}

// Botón "Compartir producto": usa el menú nativo de compartir del celular
// si está disponible, o copia el link al portapapeles como respaldo.
async function shareCurrentProduct(btn) {
  const url = window.location.href;
  const name = document.getElementById("product-modal-name")?.textContent || document.title;
  const label = btn.querySelector(".text-btn-label");

  if (navigator.share) {
    try {
      await navigator.share({ title: name, text: `Mira este producto de Lexmonn: ${name}`, url });
    } catch (err) {
      // el usuario cerró el menú de compartir sin elegir nada
    }
    return;
  }

  const originalText = label ? label.textContent : "";
  try {
    await navigator.clipboard.writeText(url);
    if (label) label.textContent = "¡Enlace copiado!";
  } catch (err) {
    try {
      window.prompt("Copia este link para compartirlo:", url);
    } catch (promptErr) {
      // algunos navegadores embebidos en apps tampoco soportan prompt()
    }
    return;
  }
  setTimeout(() => {
    if (label) label.textContent = originalText;
  }, 2200);
}

// Refresca el precio mostrado en la página de producto con el dato más
// reciente de la Sheet (por si cambió después del último build).
function hydrateProductDetail() {
  if (!document.body || document.body.dataset.page !== "product") return;
  const id = document.body.dataset.productId;
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;

  const priceEl = document.getElementById("product-modal-price");
  const badgeEl = document.getElementById("product-modal-discount-badge");
  if (!priceEl) return;

  priceEl.innerHTML = LexmonnTemplates.renderPriceHtml(p, { large: true });
  if (badgeEl) {
    badgeEl.hidden = !hasDiscount(p);
    badgeEl.textContent = hasDiscount(p) ? `-${getDiscountPercent(p)}%` : "";
  }
}

// ---------- Visor de imagen con zoom ----------

function openLightbox(src, alt) {
  const lightboxImg = document.getElementById("lightbox-img");
  lightboxImg.src = src;
  lightboxImg.alt = alt || "";
  lightboxImg.classList.remove("zoomed");
  lightboxImg.style.transformOrigin = "center center";
  document.getElementById("image-lightbox").hidden = false;
  lockBodyScroll();
  pushOpen(closeLightbox, document.getElementById("lightbox-close"));
}

function closeLightbox() {
  const box = document.getElementById("image-lightbox");
  if (box.hidden) return;
  box.hidden = true;
  document.getElementById("lightbox-img").classList.remove("zoomed");
  unlockBodyScroll();
  popOpen(closeLightbox);
}

function toggleLightboxZoom(e) {
  const img = document.getElementById("lightbox-img");
  if (img.classList.contains("zoomed")) {
    img.classList.remove("zoomed");
  } else {
    const rect = img.getBoundingClientRect();
    const originX = ((e.clientX - rect.left) / rect.width) * 100;
    const originY = ((e.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${originX}% ${originY}%`;
    img.classList.add("zoomed");
  }
}

// ---------- Carrito ----------

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // sin almacenamiento el carrito vive solo mientras la pestaña esté abierta
  }
}

function addToCart(id, qty) {
  cart[id] = (cart[id] || 0) + qty;
  saveCart();
  renderCart();
  openCart();
}

function updateQty(id, delta) {
  if (!cart[id]) return;
  cart[id] += delta;
  if (cart[id] <= 0) delete cart[id];
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  delete cart[id];
  saveCart();
  renderCart();
}

function getCartEntries() {
  return Object.entries(cart)
    .map(([id, qty]) => ({ product: PRODUCTS.find((p) => p.id === id), qty }))
    .filter((e) => e.product);
}

function renderCart() {
  const itemsEl = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  const checkoutBtn = document.getElementById("checkout-btn");
  const entries = getCartEntries();

  const countTotal = entries.reduce((sum, e) => sum + e.qty, 0);
  document.getElementById("cart-count").textContent = countTotal;
  document.getElementById("cart-fab-count").textContent = countTotal;
  document.getElementById("cart-fab").hidden = countTotal === 0;

  if (entries.length === 0) {
    itemsEl.innerHTML = `<div class="empty-cart">${icon("cart", 36)}<p>Tu carrito está vacío</p><a class="text-btn" href="/catalogo.html">Ver el catálogo ${icon("arrowRight", 16)}</a></div>`;
    totalEl.textContent = formatPrice(0);
    checkoutBtn.disabled = true;
    return;
  }

  let total = 0;
  itemsEl.innerHTML = entries
    .map(({ product, qty }) => {
      const price = getEffectivePrice(product);
      total += price * qty;
      const id = escapeHtml(product.id);
      const nombre = escapeHtml(product.nombre);
      const href = product.slug ? `/productos/${product.slug}.html` : "#";
      return `<div class="cart-item">
        <img ${LexmonnTemplates.fotoAttrs(product.imagen, { preferido: 200, srcset: false })} alt="" width="64" height="64" loading="lazy" decoding="async">
        <div class="cart-item-info">
          <a class="cart-item-name" href="${href}">${nombre}</a>
          <p class="cart-item-price">${formatPrice(price)} c/u${hasDiscount(product) ? ` <span class="cart-item-was">antes ${formatPrice(product.precio)}</span>` : ""}</p>
          <div class="cart-item-row">
            <div class="qty-stepper qty-stepper-sm" role="group" aria-label="Cantidad de ${nombre}">
              <button type="button" class="qty-btn" data-action="minus" data-id="${id}" aria-label="Quitar una unidad">${icon("minus", 16)}</button>
              <span class="qty-value">${qty}</span>
              <button type="button" class="qty-btn" data-action="plus" data-id="${id}" aria-label="Agregar una unidad">${icon("plus", 16)}</button>
            </div>
            <strong class="cart-item-subtotal">${formatPrice(price * qty)}</strong>
          </div>
        </div>
        <button type="button" class="icon-btn remove-btn" data-action="remove" data-id="${id}" aria-label="Eliminar ${nombre} del carrito">${icon("trash", 18)}</button>
      </div>`;
    })
    .join("");

  itemsEl.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "plus") updateQty(id, 1);
      else if (action === "minus") updateQty(id, -1);
      else if (action === "remove") removeFromCart(id);
    });
  });

  totalEl.textContent = formatPrice(total);
  checkoutBtn.disabled = false;
}

// ---------- UI: paneles y modal ----------

function bindGlobalEvents() {
  document.addEventListener("click", handleAddClick);

  document.getElementById("cart-btn").addEventListener("click", openCart);
  document.getElementById("cart-fab").addEventListener("click", openCart);
  document.getElementById("cart-close").addEventListener("click", closeCart);
  document.getElementById("cart-overlay").addEventListener("click", closeCart);

  document.getElementById("checkout-btn").addEventListener("click", () => {
    closeCart();
    openCheckout();
  });
  document.getElementById("checkout-close").addEventListener("click", closeCheckout);
  document.getElementById("checkout-overlay").addEventListener("click", closeCheckout);

  document.getElementById("checkout-form").addEventListener("submit", handleCheckoutSubmit);

  document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
  document.getElementById("image-lightbox").addEventListener("click", (e) => {
    if (e.target.id === "image-lightbox") closeLightbox();
  });
  document.getElementById("lightbox-img").addEventListener("click", toggleLightboxZoom);
}

function openCart() {
  const panel = document.getElementById("cart-panel");
  if (!panel.hidden) return;
  panel.hidden = false;
  document.getElementById("cart-overlay").hidden = false;
  lockBodyScroll();
  pushOpen(closeCart, document.getElementById("cart-close"));
}
function closeCart() {
  const panel = document.getElementById("cart-panel");
  if (panel.hidden) return;
  panel.hidden = true;
  document.getElementById("cart-overlay").hidden = true;
  unlockBodyScroll();
  popOpen(closeCart);
}
function openCheckout() {
  document.getElementById("checkout-modal").hidden = false;
  document.getElementById("checkout-overlay").hidden = false;
  lockBodyScroll();
  pushOpen(closeCheckout, document.querySelector("#checkout-form input"));
}
function closeCheckout() {
  const modal = document.getElementById("checkout-modal");
  if (modal.hidden) return;
  modal.hidden = true;
  document.getElementById("checkout-overlay").hidden = true;
  unlockBodyScroll();
  popOpen(closeCheckout);
}

// Validación propia en vez de los globos del navegador: el error aparece
// junto al formulario, en español siempre, y el foco va al primer campo
// que falta.
function validateCheckout(form) {
  const errorEl = document.getElementById("checkout-error");
  const missing = [];
  let firstInvalid = null;
  form.querySelectorAll("input").forEach((input) => {
    const value = input.value.trim();
    const empty = input.required && !value;
    const badEmail = input.type === "email" && value && !input.checkValidity();
    // Cédula o NIT: se aceptan puntos, espacios o el guion del dígito de
    // verificación, pero tiene que haber entre 5 y 12 números.
    const digitos = value.replace(/\D/g, "").length;
    const badDoc = input.name === "cedula" && value && (digitos < 5 || digitos > 12);
    const invalid = empty || badEmail || badDoc;
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
    if (invalid) {
      const label = input.closest(".field").querySelector(".field-label").firstChild.textContent.trim();
      missing.push(badEmail ? "un correo válido" : badDoc ? "una cédula o NIT válido" : label.toLowerCase().replace(/\bnit\b/, "NIT"));
      if (!firstInvalid) firstInvalid = input;
    }
  });
  if (firstInvalid) {
    errorEl.textContent = `Falta: ${missing.join(", ")}.`;
    errorEl.hidden = false;
    firstInvalid.focus();
    return false;
  }
  errorEl.hidden = true;
  return true;
}

function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = e.target;
  if (!validateCheckout(form)) return;

  const data = {
    nombre: form.nombre.value.trim(),
    cedula: form.cedula.value.trim(),
    direccion: form.direccion.value.trim(),
    ciudad: form.ciudad.value.trim(),
    telefono: form.telefono.value.trim(),
    correo: form.correo.value.trim(),
  };

  const entries = getCartEntries();
  if (entries.length === 0) return;

  const message = buildWhatsAppMessage(data, entries);
  const phone = (CONFIG.WHATSAPP_NUMBER || "").replace(/\D/g, "");
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank");

  cart = {};
  saveCart();
  renderCart();
  closeCheckout();
  form.reset();
}

// El mensaje incluye el ENLACE de cada producto debajo de su línea.
//
// No se pueden adjuntar imágenes: un enlace wa.me solo admite el parámetro
// `text`. El enlace es lo más cerca que se llega: WhatsApp le arma una vista
// previa con foto al PRIMER enlace del mensaje, y los demás quedan tocables.
function buildWhatsAppMessage(buyer, entries) {
  let total = 0;
  const lines = [];
  lines.push(`*NUEVO PEDIDO - LEXMONN*`);
  lines.push("");
  lines.push(`*Datos del comprador*`);
  lines.push(`Nombre: ${buyer.nombre}`);
  lines.push(`Cédula/NIT: ${buyer.cedula}`);
  lines.push(`Dirección: ${buyer.direccion}`);
  lines.push(`Ciudad/Municipio: ${buyer.ciudad}`);
  lines.push(`Teléfono: ${buyer.telefono}`);
  lines.push(`Correo: ${buyer.correo}`);
  lines.push("");
  lines.push(`*Productos*`);
  entries.forEach(({ product, qty }) => {
    const price = getEffectivePrice(product);
    const subtotal = price * qty;
    total += subtotal;
    const precioLabel = hasDiscount(product)
      ? `${formatPrice(price)} (antes ${formatPrice(product.precio)})`
      : formatPrice(price);
    lines.push(`- ${product.nombre} | Cant: ${qty} | Precio: ${precioLabel} | Subtotal: ${formatPrice(subtotal)}`);
    // Con `https://` explícito: sin el esquema, WhatsApp a veces no lo
    // reconoce como enlace y no arma la vista previa.
    if (product.slug) lines.push(`${SITIO_URL}/productos/${product.slug}.html`);
  });
  lines.push("");
  lines.push(`*TOTAL: ${formatPrice(total)}*`);
  return lines.join("\n");
}
