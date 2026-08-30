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

let PRODUCTS = [];
let cart = loadCart();
let activeCategory = (document.body && document.body.dataset.category) || "Todos";
let searchTerm = "";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  if (CONFIG.STORE_TAGLINE) document.getElementById("store-tagline").textContent = CONFIG.STORE_TAGLINE;
  if (CONFIG.STORE_LOCATION) document.getElementById("store-location").textContent = CONFIG.STORE_LOCATION;

  bindGlobalEvents();
  initSearch();
  initStaticProductDetail();
  initOffers();
  // Las ofertas se re-dibujan cuando llega la Sheet en vivo, para que un
  // descuento puesto después del último build aparezca igual.
  loadCatalog().then(renderOffers);
  renderCart();
  initPrivacyNotice();
  initPromoPopup();
});

// ---------- Bloqueo del scroll de fondo mientras hay un panel/modal abierto ----------
// Evita que, al llegar al final del scroll dentro de un modal/panel (en
// especial en celular), el navegador "empuje" el scroll hacia el catálogo
// de atrás. Usa un contador porque a veces un panel abre a otro (ej. el
// carrito se abre al agregar desde el modal de producto, que se cierra
// justo después) y no debe desbloquearse hasta que no quede ninguno abierto.
let openOverlaysCount = 0;
function lockBodyScroll() {
  openOverlaysCount++;
  document.body.style.overflow = "hidden";
}
function unlockBodyScroll() {
  openOverlaysCount = Math.max(0, openOverlaysCount - 1);
  if (openOverlaysCount === 0) document.body.style.overflow = "";
}

// ---------- Pop-up de promoción ----------
//
// La marca de "ya se mostró" vive en localStorage y no en sessionStorage,
// porque sessionStorage es POR PESTAÑA: al abrir un producto en una pestaña
// nueva (y más con rel="noopener", que impide heredar la del origen) la
// pestaña arranca sin la marca y el pop-up volvía a salir en cada producto
// que el cliente abriera. localStorage es compartido entre pestañas.
//
// Como localStorage no se borra al cerrar el navegador, se guarda la FECHA y
// se deja volver a mostrar pasado un día: así el visitante que vuelve la
// semana entrante sí ve la promoción, pero no la sufre en cada clic.

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

  setTimeout(() => {
    // Se vuelve a comprobar justo antes de mostrarlo: si el cliente abrió
    // varias pestañas casi a la vez, la primera en aparecer deja la marca y
    // las demás ya no lo repiten.
    if (promoYaSeMostro()) return;
    marcarPromoMostrado();
    document.getElementById("promo-modal").hidden = false;
    document.getElementById("promo-overlay").hidden = false;
    lockBodyScroll();
  }, 1200);
}

// ---------- Aviso de privacidad ----------
//
// Es un aviso INFORMATIVO, no un consentimiento, y es a propósito: este
// sitio no tiene analítica, ni píxeles, ni publicidad. Lo único que se
// guarda es el carrito, que es estrictamente necesario para que la tienda
// funcione. No hay nada que el visitante pueda aceptar o rechazar, así que
// darle dos botones sería una elección falsa: haría clic en cualquiera de
// los dos y no cambiaría nada.
//
// El día que se agregue Google Analytics, Meta Pixel o similar, esto tiene
// que convertirse en un consentimiento de verdad: dos opciones, guardar la
// respuesta, y cargar el script únicamente si el visitante aceptó. También
// hay que reescribir este texto y /privacidad.html, que hoy afirman que no
// existe ningún seguimiento.

function initPrivacyNotice() {
  const notice = document.getElementById("privacy-notice");
  if (!notice) return;

  let yaVisto = null;
  try {
    yaVisto = localStorage.getItem(PRIVACY_NOTICE_KEY);
  } catch {
    // navegador con almacenamiento bloqueado: se mostrará el aviso otra vez,
    // que es preferible a no mostrarlo nunca.
  }
  if (!yaVisto) notice.hidden = false;

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
const DIACRITICS_RE = new RegExp("[\u0300-\u036f]", "g");

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

  // Las páginas de producto, 404 y privacidad no tienen catálogo que
  // filtrar: ahí el buscador manda a la home con ?q=, que sí lo lee.
  const hasCatalog = !!document.getElementById("catalog");

  const initial = (new URLSearchParams(window.location.search).get("q") || "").trim();
  if (initial) {
    input.value = initial;
    searchTerm = initial;
  }
  clearBtn.hidden = !input.value;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!hasCatalog) {
      window.location.href = value ? `/?q=${encodeURIComponent(value)}` : "/";
      return;
    }
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
  renderSearchEmptyState(visible);
}

function renderSearchEmptyState(visibleCount) {
  const catalogEl = document.getElementById("catalog");
  if (!catalogEl) return;

  const existing = document.getElementById("search-empty");
  if (visibleCount > 0 || !searchTerm) {
    if (existing) existing.remove();
    return;
  }

  const el = existing || document.createElement("p");
  el.id = "search-empty";
  el.className = "search-empty";
  el.innerHTML = `No encontramos productos para <strong>"${escapeHtml(searchTerm)}"</strong>. Prueba con otra palabra o <button type="button" id="search-empty-reset" class="search-empty-reset">ve todo el catálogo</button>.`;
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

function closePromoPopup() {
  document.getElementById("promo-modal").hidden = true;
  document.getElementById("promo-overlay").hidden = true;
  unlockBodyScroll();
}

// ---------- Carga del catálogo desde Google Sheets ----------

// Cachea la respuesta del CSV en el navegador, pero la renueva cada 5 minutos:
// el parámetro "v" cambia por bloques de tiempo, así que dentro de esos 5 minutos
// las recargas usan la caché normal del navegador (más rápido) y, pasado ese tiempo,
// la URL cambia y fuerza una descarga fresca (los cambios del cliente en la Sheet
// tardan como máximo 5 minutos en verse, en vez de horas).
const SHEET_CACHE_BUCKET_MS = 5 * 60 * 1000;

function getSheetUrl() {
  const bucket = Math.floor(Date.now() / SHEET_CACHE_BUCKET_MS);
  const sep = CONFIG.SHEET_CSV_URL.includes("?") ? "&" : "?";
  return `${CONFIG.SHEET_CSV_URL}${sep}v=${bucket}`;
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
    if (!hasPrerendered) {
      if (noticeEl) noticeEl.hidden = false;
      PRODUCTS = FALLBACK_PRODUCTS.filter((p) => p.id && isActive(p.activo));
      if (catalogEl) renderCatalog();
    } else {
      PRODUCTS = FALLBACK_PRODUCTS.filter((p) => p.id && isActive(p.activo));
    }
    renderCart();
    return;
  }

  if (!hasPrerendered && loadingEl) loadingEl.hidden = false;

  try {
    const res = await fetch(getSheetUrl(), { cache: "default" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const csvText = await res.text();
    const parsed = parseCSV(csvText)
      .map(normalizeProduct)
      .filter((p) => p.id && isActive(p.activo));

    if (loadingEl) loadingEl.hidden = true;

    if (parsed.length === 0) {
      if (!hasPrerendered) {
        if (noticeEl) noticeEl.hidden = false;
        PRODUCTS = FALLBACK_PRODUCTS.filter((p) => p.id && isActive(p.activo));
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
      PRODUCTS = FALLBACK_PRODUCTS.filter((p) => p.id && isActive(p.activo));
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
  const allBtn = `<button class="filter-pill${activeCategory === "Todos" ? " active" : ""}" data-cat="Todos">Todos</button>`;
  const catBtns = categories
    .map(
      (cat) =>
        `<button class="filter-pill${activeCategory === cat ? " active" : ""}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
    )
    .join("");
  filtersEl.innerHTML = allBtn + catBtns;

  filtersEl.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderCatalog();
    });
  });
}

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
    itemListElement: products.map((p, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Product",
        name: p.nombre,
        description: p.descripcion,
        brand: { "@type": "Brand", name: p.marca || "Lexmonn" },
        image: p.imagen || undefined,
        offers: {
          "@type": "Offer",
          price: String(getEffectivePrice(p)),
          priceCurrency: "COP",
          availability: "https://schema.org/InStock",
        },
      },
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
  const visibleProducts = searchTerm
    ? PRODUCTS.filter((p) => productMatchesSearch(p, searchTerm))
    : activeCategory === "Todos"
      ? PRODUCTS
      : PRODUCTS.filter((p) => (p.categoria || "Sin categoría") === activeCategory);

  injectProductSchema(visibleProducts);

  catalogEl.innerHTML = visibleProducts.map(LexmonnTemplates.renderProductCard).join("");
  wireProductCards(catalogEl, visibleProducts);

  renderSearchEmptyState(visibleProducts.length);
}

// Engancha el modal de vista rápida y el botón "Agregar" de las tarjetas de
// un contenedor. Lo usan la grilla del catálogo y el carrusel de ofertas.
//
// La cantidad se busca DENTRO de la tarjeta y no por un id global: un mismo
// producto puede estar a la vez en las ofertas y en el catálogo, y dos
// campos con el mismo id harían que "Agregar" leyera siempre el primero.
function wireProductCards(container, products) {
  if (!container) return;
  container.querySelectorAll(".product-card").forEach((card) => {
    const id = card.dataset.id;
    const p = products.find((x) => x.id === id);
    if (!p) return;

    // El enlace de la tarjeta ya abre la página del producto en una pestaña
    // nueva por sí solo (target="_blank" en la plantilla). No se intercepta
    // el clic: así funciona aunque el JavaScript todavía no haya cargado.

    const addBtn = card.querySelector(".add-btn");
    const qtyInput = card.querySelector(".qty-input");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const qty = Math.max(1, parseInt(qtyInput && qtyInput.value, 10) || 1);
        addToCart(id, qty);
      });
    }
  });
}

// ---------- Carrusel "Ofertas para ti" ----------

function renderOffers() {
  const section = document.getElementById("offers");
  const track = document.getElementById("offers-track");
  if (!section || !track) return;

  const offers = LexmonnTemplates.getOfferProducts(PRODUCTS);
  section.hidden = offers.length === 0;
  track.innerHTML = offers.map(LexmonnTemplates.renderProductCard).join("");
  wireProductCards(track, offers);
  track.scrollLeft = 0;
  updateOffersArrows();
}

// Las flechas solo aparecen si de verdad hay a dónde desplazarse, y cada una
// se esconde al llegar a su extremo. En celular no se usan: se desliza con
// el dedo.
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
    const ancho = card ? card.getBoundingClientRect().width : 220;
    return (ancho + 14) * 2;
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

// ---------- Página estática de producto (/productos/slug.html) ----------

// Engancha el botón de "Añadir al carrito" y la galería de la página de
// producto. Las clases y los ids `product-modal-*` que se ven aquí son los
// del marcado de esta página: se conservaron al quitar el modal de vista
// rápida para no reescribir también los estilos.
function initStaticProductDetail() {
  if (!document.body || document.body.dataset.page !== "product") return;

  const addBtn = document.getElementById("product-modal-add");
  const qtyInput = document.getElementById("product-modal-qty");
  if (addBtn && qtyInput && addBtn.dataset.id) {
    addBtn.addEventListener("click", () => {
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      addToCart(addBtn.dataset.id, qty);
    });
  }

  const shareBtn = document.getElementById("product-share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => shareCurrentProduct(shareBtn));
  }

  const mainImg = document.getElementById("product-modal-img");
  const thumbsEl = document.getElementById("product-modal-thumbs");
  if (mainImg) {
    mainImg.addEventListener("click", () => openLightbox(mainImg.src));
  }
  if (thumbsEl) {
    thumbsEl.querySelectorAll(".product-modal-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        mainImg.src = thumb.dataset.src;
        thumbsEl.querySelectorAll(".product-modal-thumb").forEach((t) => t.classList.remove("active"));
        thumb.classList.add("active");
      });
      thumb.addEventListener("error", () => { thumb.src = PLACEHOLDER_IMG; });
    });
  }
}

// Botón "Compartir producto": usa el menú nativo de compartir del celular
// si está disponible, o copia el link al portapapeles como respaldo.
async function shareCurrentProduct(btn) {
  const url = window.location.href;
  const name = document.getElementById("product-modal-name")?.textContent || document.title;

  if (navigator.share) {
    try {
      await navigator.share({ title: name, text: `Mira este producto de Lexmonn: ${name}`, url });
    } catch (err) {
      // el usuario cerró el menú de compartir sin elegir nada, no hacemos nada
    }
    return;
  }

  const originalText = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "✅ ¡Enlace copiado!";
  } catch (err) {
    try {
      window.prompt("Copia este link para compartirlo:", url);
    } catch (promptErr) {
      // algunos navegadores (ej. ciertos navegadores embebidos en apps)
      // tampoco soportan prompt() — no queda más respaldo posible.
    }
    return;
  }
  setTimeout(() => { btn.textContent = originalText; }, 2200);
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

  if (hasDiscount(p)) {
    priceEl.innerHTML = `${formatPrice(p.precioOferta)} <span class="product-modal-price-original">${formatPrice(p.precio)}</span>`;
    if (badgeEl) {
      badgeEl.textContent = `-${getDiscountPercent(p)}%`;
      badgeEl.hidden = false;
    }
  } else {
    priceEl.textContent = formatPrice(p.precio);
    if (badgeEl) badgeEl.hidden = true;
  }
}

// ---------- Visor de imagen con zoom ----------

function openLightbox(src) {
  const lightboxImg = document.getElementById("lightbox-img");
  lightboxImg.src = src;
  lightboxImg.classList.remove("zoomed");
  lightboxImg.style.transformOrigin = "center center";
  document.getElementById("image-lightbox").hidden = false;
  lockBodyScroll();
}

function closeLightbox() {
  document.getElementById("image-lightbox").hidden = true;
  document.getElementById("lightbox-img").classList.remove("zoomed");
  unlockBodyScroll();
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
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
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
    itemsEl.innerHTML = `<p class="empty-cart">Tu carrito está vacío</p>`;
    totalEl.textContent = formatPrice(0);
    checkoutBtn.disabled = true;
    return;
  }

  itemsEl.innerHTML = "";
  let total = 0;
  entries.forEach(({ product, qty }) => {
    const price = getEffectivePrice(product);
    total += price * qty;
    const item = document.createElement("div");
    item.className = "cart-item";
    item.innerHTML = `
      <img src="${product.imagen || PLACEHOLDER_IMG}" alt="${escapeHtml(product.nombre)}" width="56" height="56" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_IMG}'">
      <div class="cart-item-info">
        <p class="cart-item-name">${escapeHtml(product.nombre)}</p>
        <p class="cart-item-price">${formatPrice(price)} c/u${hasDiscount(product) ? " <span class=\"cart-item-was\">antes " + formatPrice(product.precio) + "</span>" : ""}</p>
        <div class="cart-item-qty">
          <button data-action="minus" data-id="${product.id}">−</button>
          <span>${qty}</span>
          <button data-action="plus" data-id="${product.id}">+</button>
          <button class="remove-btn" data-action="remove" data-id="${product.id}">Eliminar</button>
        </div>
      </div>
    `;
    itemsEl.appendChild(item);
  });

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
  document.getElementById("cart-panel").hidden = false;
  document.getElementById("cart-overlay").hidden = false;
  lockBodyScroll();
}
function closeCart() {
  document.getElementById("cart-panel").hidden = true;
  document.getElementById("cart-overlay").hidden = true;
  unlockBodyScroll();
}
function openCheckout() {
  document.getElementById("checkout-modal").hidden = false;
  document.getElementById("checkout-overlay").hidden = false;
  lockBodyScroll();
}
function closeCheckout() {
  document.getElementById("checkout-modal").hidden = true;
  document.getElementById("checkout-overlay").hidden = true;
  unlockBodyScroll();
}

function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    nombre: form.nombre.value.trim(),
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

function buildWhatsAppMessage(buyer, entries) {
  let total = 0;
  const lines = [];
  lines.push(`*NUEVO PEDIDO - LEXMONN*`);
  lines.push("");
  lines.push(`*Datos del comprador*`);
  lines.push(`Nombre: ${buyer.nombre}`);
  lines.push(`Dirección: ${buyer.direccion}`);
  lines.push(`Ciudad/Municipio: ${buyer.ciudad}`);
  lines.push(`Teléfono: ${buyer.telefono}`);
  if (buyer.correo) lines.push(`Correo: ${buyer.correo}`);
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
  });
  lines.push("");
  lines.push(`*TOTAL: ${formatPrice(total)}*`);
  return lines.join("\n");
}
