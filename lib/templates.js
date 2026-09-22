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

  const SITE_URL = "https://lexmonn.com";

  // ---------- Íconos ----------
  // SVG en línea (trazos de Lucide, licencia ISC; marcas de Simple Icons, CC0)
  // en vez de emojis: los emojis cambian de dibujo según el celular, no
  // heredan el color del texto y los lectores de pantalla los leen en voz alta.
  const STROKE_ICONS = {
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    zoom: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    factory: '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 2.094 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  };

  const FILL_ICONS = {
    whatsapp:
      '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>',
    facebook:
      '<path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.3-1.5 1.6-1.5H16V4.2C15.7 4.1 14.8 4 13.7 4 11.4 4 9.9 5.4 9.9 8v2.5H7.4v3h2.5V21h3.6z"/>',
    tiktok:
      '<path d="M16.5 3c.3 2 1.7 3.6 3.7 4v3c-1.4 0-2.7-.4-3.7-1.2v6.4a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3.1a2.6 2.6 0 1 0 1.8 2.5V3h3z"/>',
  };

  STROKE_ICONS.instagram =
    '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>';

  function icon(name, size) {
    const s = size || 20;
    if (FILL_ICONS[name]) {
      return `<svg class="icon icon-${name}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true" focusable="false">${FILL_ICONS[name]}</svg>`;
    }
    return `<svg class="icon icon-${name}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${STROKE_ICONS[name] || ""}</svg>`;
  }

  // ---------- Precio ----------

  function renderPriceHtml(p, opts) {
    opts = opts || {};
    if (opts.large) {
      return hasDiscount(p)
        ? `<span class="price-now price-sale">${formatPrice(p.precioOferta)}</span> <span class="product-modal-price-original">${formatPrice(p.precio)}</span>`
        : `<span class="price-now">${formatPrice(p.precio)}</span>`;
    }
    if (hasDiscount(p)) {
      return `<div class="product-price-row">
        <span class="product-price product-price-sale">${formatPrice(p.precioOferta)}</span>
        <span class="product-price-original">${formatPrice(p.precio)}</span>
      </div>`;
    }
    return `<div class="product-price-row"><span class="product-price">${formatPrice(p.precio)}</span></div>`;
  }

  // ---------- Tarjeta de producto ----------
  // Se usa en el catálogo, las categorías, el carrusel de ofertas y los
  // relacionados de cada producto.
  //
  // El clic abre la página del producto en una PESTAÑA NUEVA, para que el
  // cliente no pierda el catálogo ni lo que ya lleva mirado. Como es un
  // enlace de verdad con target, funciona incluso antes de que cargue el
  // JavaScript, y respeta clic central, "abrir en pestaña nueva", etc.
  //
  // El botón "Agregar" suma una unidad: la cantidad se ajusta después en el
  // carrito con + y −. Un campo numérico en cada tarjeta eran dos controles
  // más por producto, diminutos en celular.
  function renderProductCard(p) {
    const onSale = hasDiscount(p);
    const href = p.slug ? `/productos/${p.slug}.html` : "#";
    const nombre = escapeHtml(p.nombre);
    const eyebrow = p.marca && p.marca !== "Lexmonn" ? p.marca : p.categoria || "";
    return `
    <article class="product-card" data-id="${escapeHtml(p.id)}" data-price="${getEffectivePrice(p)}">
      <a class="product-card-link" href="${href}" target="_blank" rel="noopener" aria-label="Ver ${nombre} (se abre en una pestaña nueva)">
        <div class="product-media">
          ${onSale ? `<span class="discount-badge">-${getDiscountPercent(p)}%</span>` : ""}
          ${p.marca === "Lexmonn" ? `<span class="made-badge">Hecho por Lexmonn</span>` : ""}
          <img class="product-img" src="${escapeHtml(p.imagen || PLACEHOLDER_IMG)}" alt="${nombre}"
            width="400" height="400" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_IMG}'">
        </div>
        <div class="product-body">
          ${eyebrow ? `<p class="product-eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
          <p class="product-name">${nombre}</p>
          ${p.descripcion ? `<p class="product-desc">${escapeHtml(p.descripcion)}</p>` : ""}
          ${renderPriceHtml(p)}
        </div>
      </a>
      <div class="product-actions">
        <button type="button" class="add-btn" data-add="${escapeHtml(p.id)}" aria-label="Agregar ${nombre} al carrito">${icon("cart", 18)}<span>Agregar</span></button>
      </div>
    </article>`;
  }

  // ---------- Carrusel "Ofertas de Aniversario" ----------
  // Los productos que tienen Precio_Oferta en la Sheet. Si no hay ninguna
  // oferta, la sección se entrega oculta en vez de dejar un título vacío.
  function getOfferProducts(products) {
    return (products || []).filter(hasDiscount);
  }

  function renderOffersSection(products) {
    const offers = getOfferProducts(products);
    return `<section id="offers" class="section offers"${offers.length ? "" : " hidden"} aria-labelledby="offers-title">
    <div class="container">
      <div class="section-head">
        <div>
          <p class="eyebrow">Por tiempo limitado</p>
          <h2 id="offers-title" class="section-title">Ofertas de Aniversario</h2>
        </div>
        <div class="offers-controls">
          <button type="button" class="round-btn offers-arrow" id="offers-prev" aria-label="Ver ofertas anteriores" hidden>${icon("chevronLeft")}</button>
          <button type="button" class="round-btn offers-arrow" id="offers-next" aria-label="Ver más ofertas" hidden>${icon("chevronRight")}</button>
        </div>
      </div>
      <div class="offers-track" id="offers-track">${offers.map(renderProductCard).join("")}</div>
    </div>
  </section>`;
  }

  // ---------- Categorías (portada y pie de página) ----------
  // cats: [{ name, slug, count, image, tagline, insignia }]
  // La primera (Porta Herramientas, la de fabricación propia) va destacada:
  // ocupa el doble y va sobre fondo oscuro.
  function renderCategoryTiles(cats) {
    if (!cats || !cats.length) return "";
    const tiles = cats
      .map((c, i) => {
        // La foto es decorativa: el nombre de la categoría ya va como texto
        // dentro del mismo enlace, así que un alt lo repetiría para quien usa
        // lector de pantalla.
        const etiqueta = c.insignia || `${c.count} ${c.count === 1 ? "producto" : "productos"}`;
        return `<a class="cat-card${i === 0 ? " cat-card--featured" : ""}" href="/categoria/${c.slug}.html" data-cat="${escapeHtml(c.name)}">
        <span class="cat-card-media">
          <img class="cat-card-img" src="${escapeHtml(c.image || PLACEHOLDER_IMG)}" alt=""
            width="480" height="360" loading="${i < 3 ? "eager" : "lazy"}" decoding="async" onerror="this.src='${PLACEHOLDER_IMG}'">
        </span>
        <span class="cat-card-body">
          <span class="cat-card-tag">${escapeHtml(etiqueta)}</span>
          <span class="cat-card-name">${escapeHtml(c.name)}</span>
          ${c.tagline ? `<span class="cat-card-tagline">${escapeHtml(c.tagline)}</span>` : ""}
          <span class="cat-card-cta">Ver productos ${icon("arrowRight", 18)}</span>
        </span>
      </a>`;
      })
      .join("");
    return `<div class="cat-grid">${tiles}</div>`;
  }

  // ---------- Galería de la página de producto ----------
  // Las miniaturas son botones (no imágenes sueltas) para que se puedan usar
  // con teclado y el lector de pantalla anuncie que se pueden activar.
  function renderGalleryThumbs(p) {
    const images = (p.imagenes && p.imagenes.length ? p.imagenes : [p.imagen]).filter(Boolean);
    if (images.length <= 1) return { images, thumbsHtml: "" };
    const thumbsHtml = images
      .map(
        (url, idx) =>
          `<button type="button" class="gallery-thumb${idx === 0 ? " active" : ""}" data-src="${escapeHtml(url)}" aria-label="Ver foto ${idx + 1} de ${images.length}"${idx === 0 ? ' aria-current="true"' : ""}>
            <img src="${escapeHtml(url)}" alt="" width="72" height="72" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_IMG}'">
          </button>`
      )
      .join("");
    return { images, thumbsHtml };
  }

  // ---------- Migas de pan ----------
  // items: [{ name, href }] (href null/omitido = página actual, sin enlace)
  function renderBreadcrumbs(items) {
    const parts = items.map((it, idx) => {
      const isLast = idx === items.length - 1;
      const label = escapeHtml(it.name);
      return it.href && !isLast
        ? `<li><a href="${it.href}">${label}</a></li>`
        : `<li><span${isLast ? ' aria-current="page"' : ""}>${label}</span></li>`;
    });
    return `<nav class="breadcrumbs" aria-label="Ruta de navegación"><ol>${parts.join("")}</ol></nav>`;
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

  // ---------- JSON-LD Product ----------
  //
  // `brand` sale de la columna Marca de la Sheet si algún día existe, o si no
  // de la marca que aparece en el nombre (ver detectBrand en shared.js). Si no
  // se reconoce ninguna, se omite en vez de afirmar que es Lexmonn.
  //
  // `priceValidUntil` es un campo que Google recomienda en las ofertas. Se
  // pone a un año del build; como el build corre cada 2 horas, la fecha se
  // renueva sola y nunca queda vencida.
  function renderProductJsonLd(p, url) {
    const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const json = {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}#product`,
      sku: p.id,
      name: p.nombre,
      image: (p.imagenes && p.imagenes.length ? p.imagenes : [p.imagen]).filter(Boolean),
      url,
      category: p.categoria || undefined,
      offers: {
        "@type": "Offer",
        url,
        price: String(getEffectivePrice(p)),
        priceCurrency: "COP",
        priceValidUntil: validUntil,
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Lexmonn" },
      },
    };
    if (p.descripcion) json.description = p.descripcion;
    if (p.marca) json.brand = { "@type": "Brand", name: p.marca };
    return json;
  }

  // ---------- WhatsApp ----------

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
    icon,
    renderPriceHtml,
    renderProductCard,
    getOfferProducts,
    renderOffersSection,
    renderCategoryTiles,
    renderGalleryThumbs,
    renderBreadcrumbs,
    renderBreadcrumbJsonLd,
    renderProductJsonLd,
    buildProductWhatsAppText,
    buildWhatsAppLink,
  };
});
