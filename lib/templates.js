// ============================================================
// LEXMONN - Plantillas de HTML compartidas entre el navegador
// (app.js) y el script de build (build.js), para que la tarjeta
// de producto se vea EXACTAMENTE igual sin importar quién la
// dibuje. No depende del DOM ni de Node.
// ============================================================

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./shared.js"));
  } else {
    root.LexmonnTemplates = factory(root.LexmonnShared);
  }
})(typeof window !== "undefined" ? window : this, function (Shared) {
  const { escapeHtml, hasDiscount, getEffectivePrice, getDiscountPercent, formatPrice, PLACEHOLDER_IMG } = Shared;

  function renderPriceHtml(p, opts) {
    opts = opts || {};
    const priceClass = opts.large ? "product-modal-price" : "product-price";
    const originalClass = opts.large ? "product-modal-price-original" : "product-price-original";
    if (hasDiscount(p)) {
      if (opts.large) {
        return `${formatPrice(p.precioOferta)} <span class="${originalClass}">${formatPrice(p.precio)}</span>`;
      }
      return `<div class="product-price-row">
        <span class="product-price product-price-sale">${formatPrice(p.precioOferta)}</span>
        <span class="${originalClass}">${formatPrice(p.precio)}</span>
      </div>`;
    }
    return opts.large
      ? formatPrice(p.precio)
      : `<div class="${priceClass}">${formatPrice(p.precio)}</div>`;
  }

  // Tarjeta usada tanto en la grilla de Home/Categoría (build.js y app.js)
  // como en el carrusel de ofertas.
  //
  // El clic abre la página del producto en una PESTAÑA NUEVA, para que el
  // cliente no pierda el catálogo ni lo que ya lleva mirado. Como es un
  // enlace de verdad con target, funciona incluso antes de que cargue el
  // JavaScript, y respeta clic central, "abrir en pestaña nueva", etc.
  function renderProductCard(p) {
    const onSale = hasDiscount(p);
    const href = p.slug ? `/productos/${p.slug}.html` : "#";
    return `
    <div class="product-card" data-id="${escapeHtml(p.id)}">
      <a class="product-card-link" href="${href}" target="_blank" rel="noopener" aria-label="Ver ${escapeHtml(p.nombre)} (se abre en una pestaña nueva)">
        <div class="product-img-wrap">
          ${onSale ? `<span class="discount-badge">-${getDiscountPercent(p)}%</span>` : ""}
          <img class="product-img" src="${p.imagen || PLACEHOLDER_IMG}" alt="${escapeHtml(p.nombre)}"
            loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_IMG}'">
        </div>
        <div class="product-body">
          <p class="product-name">${escapeHtml(p.nombre)}</p>
          <p class="product-desc">${escapeHtml(p.descripcion)}</p>
          ${renderPriceHtml(p)}
        </div>
      </a>
      <div class="product-actions">
        <input type="number" class="qty-input" min="1" value="1" aria-label="Cantidad">
        <button class="add-btn" data-id="${escapeHtml(p.id)}">Agregar</button>
      </div>
    </div>`;
  }

  // Carrusel "Ofertas para ti": los productos que tienen Precio_Oferta en la
  // Sheet. Se desliza con el dedo en celular y con las flechas en escritorio.
  // Si no hay ninguna oferta, la sección se entrega oculta en vez de dejar un
  // título con el espacio vacío debajo.
  function getOfferProducts(products) {
    return (products || []).filter(hasDiscount);
  }

  function renderOffersSection(products) {
    const offers = getOfferProducts(products);
    return `<section id="offers" class="offers"${offers.length ? "" : " hidden"} aria-labelledby="offers-title">
    <h2 id="offers-title" class="offers-title">Ofertas para ti</h2>
    <div class="offers-viewport">
      <button type="button" class="offers-arrow offers-arrow-prev" id="offers-prev" aria-label="Ver ofertas anteriores" hidden>‹</button>
      <div class="offers-track" id="offers-track">${offers.map(renderProductCard).join("")}</div>
      <button type="button" class="offers-arrow offers-arrow-next" id="offers-next" aria-label="Ver más ofertas" hidden>›</button>
    </div>
  </section>`;
  }

  // Imágenes de la galería de un producto (principal + adicionales) y el HTML
  // de las miniaturas. Lo usan tanto el modal de vista rápida (app.js) como
  // la página estática de producto (build.js), para no duplicar el marcado.
  function renderGalleryThumbs(p) {
    const images = (p.imagenes && p.imagenes.length ? p.imagenes : [p.imagen]).filter(Boolean);
    if (images.length <= 1) return { images, thumbsHtml: "" };
    const thumbsHtml = images
      .map(
        (url, idx) =>
          `<img class="product-modal-thumb${idx === 0 ? " active" : ""}" src="${url}" data-src="${url}" width="56" height="56" loading="lazy" decoding="async" alt="${escapeHtml(p.nombre)} ${idx + 1}">`
      )
      .join("");
    return { images, thumbsHtml };
  }

  // Breadcrumbs visuales. items: [{ name, href }] (href null/omitido = actual, sin link)
  function renderBreadcrumbs(items) {
    const parts = items.map((it, idx) => {
      const isLast = idx === items.length - 1;
      const label = escapeHtml(it.name);
      const node = it.href && !isLast
        ? `<a href="${it.href}">${label}</a>`
        : `<span${isLast ? ' aria-current="page"' : ""}>${label}</span>`;
      return idx === 0 ? node : `<span class="sep">›</span>${node}`;
    });
    return `<nav class="breadcrumbs" aria-label="Ruta de navegación">${parts.join("")}</nav>`;
  }

  // JSON-LD BreadcrumbList. items: [{ name, url }]
  function renderBreadcrumbJsonLd(items) {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((it, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: it.name,
        item: it.url,
      })),
    };
  }

  // JSON-LD Product (para páginas individuales de producto)
  //
  // `brand` sale de la columna Marca de la Sheet. Si está vacía se asume
  // Lexmonn, que es lo correcto para los porta herramientas que fabricamos
  // nosotros — pero para una herramienta de reventa (Total, Pretul, Truper)
  // hay que llenar esa columna, o le estaríamos diciendo a Google que la
  // marca es Lexmonn cuando no lo es.
  //
  // `priceValidUntil` es un campo que Google recomienda en las ofertas. Se
  // pone a un año del build; como el build corre a diario, la fecha se
  // renueva sola y nunca queda vencida.
  function renderProductJsonLd(p, url) {
    const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      sku: p.id,
      name: p.nombre,
      description: p.descripcion,
      brand: { "@type": "Brand", name: p.marca || "Lexmonn" },
      image: (p.imagenes && p.imagenes.length ? p.imagenes : [p.imagen]).filter(Boolean),
      url,
      offers: {
        "@type": "Offer",
        url,
        price: String(getEffectivePrice(p)),
        priceCurrency: "COP",
        priceValidUntil: validUntil,
        availability: "https://schema.org/InStock",
      },
    };
  }

  // Mensaje pre-armado de WhatsApp para "comprar este producto" desde su página propia
  function buildProductWhatsAppText(p) {
    const price = getEffectivePrice(p);
    return `Hola, quiero pedir: *${p.nombre}* (${formatPrice(price)}). ¿Está disponible?`;
  }

  function buildWhatsAppLink(phone, text) {
    const cleanPhone = (phone || "").toString().replace(/\D/g, "");
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  return {
    renderPriceHtml,
    renderProductCard,
    getOfferProducts,
    renderOffersSection,
    renderGalleryThumbs,
    renderBreadcrumbs,
    renderBreadcrumbJsonLd,
    renderProductJsonLd,
    buildProductWhatsAppText,
    buildWhatsAppLink,
  };
});
