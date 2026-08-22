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

let PRODUCTS = [];
let cart = loadCart();
let activeCategory = (document.body && document.body.dataset.category) || "Todos";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  if (CONFIG.STORE_TAGLINE) document.getElementById("store-tagline").textContent = CONFIG.STORE_TAGLINE;
  if (CONFIG.STORE_LOCATION) document.getElementById("store-location").textContent = CONFIG.STORE_LOCATION;

  bindGlobalEvents();
  initStaticProductDetail();
  loadCatalog();
  renderCart();
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

function initPromoPopup() {
  const PROMO_KEY = "lexmonn_promo_shown";
  document.getElementById("promo-close").addEventListener("click", closePromoPopup);
  document.getElementById("promo-overlay").addEventListener("click", closePromoPopup);

  if (sessionStorage.getItem(PROMO_KEY)) return;

  setTimeout(() => {
    document.getElementById("promo-modal").hidden = false;
    document.getElementById("promo-overlay").hidden = false;
    lockBodyScroll();
    sessionStorage.setItem(PROMO_KEY, "1");
  }, 1200);
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

  const visibleProducts =
    activeCategory === "Todos"
      ? PRODUCTS
      : PRODUCTS.filter((p) => (p.categoria || "Sin categoría") === activeCategory);

  injectProductSchema(visibleProducts);

  catalogEl.innerHTML = visibleProducts.map(LexmonnTemplates.renderProductCard).join("");

  catalogEl.querySelectorAll(".product-card").forEach((card) => {
    const id = card.dataset.id;
    const p = visibleProducts.find((x) => x.id === id);
    if (!p) return;

    const link = card.querySelector(".product-card-link");
    if (link) {
      link.addEventListener("click", (e) => {
        // Deja que clic derecho / clic central / Ctrl/Cmd+clic abran la
        // página real del producto en vez del modal de vista rápida.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openProductModal(p);
      });
    }

    const addBtn = card.querySelector(".add-btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const qtyInput = document.getElementById(`qty-${id}`);
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        addToCart(id, qty);
      });
    }
  });
}

// ---------- Modal de detalle de producto (vista rápida) ----------

function openProductModal(p) {
  const mainImg = document.getElementById("product-modal-img");
  if (!mainImg) return; // esta página no tiene modal de vista rápida (ej. página de producto)

  const { images, thumbsHtml } = LexmonnTemplates.renderGalleryThumbs(p);
  mainImg.src = images[0] || PLACEHOLDER_IMG;
  mainImg.alt = p.nombre;
  mainImg.onerror = () => { mainImg.src = PLACEHOLDER_IMG; };
  mainImg.onclick = () => openLightbox(mainImg.src);

  const thumbsEl = document.getElementById("product-modal-thumbs");
  if (images.length > 1) {
    thumbsEl.hidden = false;
    thumbsEl.innerHTML = thumbsHtml;
    thumbsEl.querySelectorAll(".product-modal-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        mainImg.src = thumb.dataset.src;
        thumbsEl.querySelectorAll(".product-modal-thumb").forEach((t) => t.classList.remove("active"));
        thumb.classList.add("active");
      });
      thumb.addEventListener("error", () => { thumb.src = PLACEHOLDER_IMG; });
    });
  } else {
    thumbsEl.hidden = true;
    thumbsEl.innerHTML = "";
  }

  document.getElementById("product-modal-name").textContent = p.nombre;
  document.getElementById("product-modal-desc").textContent = p.descripcion;

  const priceEl = document.getElementById("product-modal-price");
  const badgeEl = document.getElementById("product-modal-discount-badge");
  if (hasDiscount(p)) {
    priceEl.innerHTML = `${formatPrice(p.precioOferta)} <span class="product-modal-price-original">${formatPrice(p.precio)}</span>`;
    badgeEl.textContent = `-${getDiscountPercent(p)}%`;
    badgeEl.hidden = false;
  } else {
    priceEl.textContent = formatPrice(p.precio);
    badgeEl.hidden = true;
  }

  const categoryEl = document.getElementById("product-modal-category");
  if (p.categoria) {
    categoryEl.innerHTML = `Categoría: <strong>${escapeHtml(p.categoria)}</strong>`;
    categoryEl.hidden = false;
  } else {
    categoryEl.hidden = true;
  }

  const qtyInput = document.getElementById("product-modal-qty");
  qtyInput.value = 1;

  const addBtn = document.getElementById("product-modal-add");
  addBtn.onclick = () => {
    const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    addToCart(p.id, qty);
    closeProductModal();
  };

  document.getElementById("product-modal").hidden = false;
  document.getElementById("product-overlay").hidden = false;
  lockBodyScroll();
}

function closeProductModal() {
  document.getElementById("product-modal").hidden = true;
  document.getElementById("product-overlay").hidden = true;
  unlockBodyScroll();
}

// ---------- Página estática de producto (/productos/slug.html) ----------

// Engancha el botón de "Añadir al carrito" y la galería de la página de
// producto pre-renderizada (no usa el modal, esa página YA es el detalle).
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

  const productClose = document.getElementById("product-close");
  const productOverlay = document.getElementById("product-overlay");
  if (productClose) productClose.addEventListener("click", closeProductModal);
  if (productOverlay) productOverlay.addEventListener("click", closeProductModal);

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
    documento: form.documento.value.trim(),
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
  lines.push(`Cédula/NIT: ${buyer.documento}`);
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
