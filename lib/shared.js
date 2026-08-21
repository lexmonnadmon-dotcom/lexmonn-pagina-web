// ============================================================
// LEXMONN - Lógica compartida entre el navegador (app.js) y el
// script de build (build.js). No depende del DOM ni de Node,
// así que corre igual en los dos lados.
//
// No necesitas editar este archivo para configurar la tienda.
// ============================================================

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
      <rect width='100%' height='100%' fill='#f2f4f2'/>
      <text x='50%' y='50%' fill='#1c5e6b' font-size='24' font-weight='800' font-family='sans-serif'
        text-anchor='middle' dominant-baseline='middle'>LEXMONN</text>
    </svg>`
  );

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function isActive(value) {
  const v = (value || "").toString().trim().toLowerCase();
  return v === "si" || v === "sí" || v === "yes" || v === "true" || v === "1";
}

function parsePrice(raw) {
  const cleaned = (raw || "0").toString().replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Quita tildes/diacríticos y arma un slug de URL (minúsculas, guiones).
function slugify(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// Simple parser CSV que soporta comillas y comas dentro de campos
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && next === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (clean.length === 0) return [];
  const headers = clean[0].map((h) => h.trim());
  return clean.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = r[idx] !== undefined ? r[idx] : ""));
    return obj;
  });
}

function normalizeProduct(row) {
  const imagenPrincipal = (row.Imagen_URL || row.Imagen || row.imagen || "").trim();
  const adicionalesRaw =
    row.Imagenes_Adicionales || row.Imagenes_adicionales || row.imagenes_adicionales || "";
  const adicionales = adicionalesRaw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const imagenes = [imagenPrincipal, ...adicionales].filter(Boolean);

  const id = (row.ID || row.Id || row.id || "").trim();
  const nombre = (row.Nombre || row.nombre || "").trim();
  const categoria = (row.Categoria || row.Categoría || row.categoria || "").trim();

  return {
    id,
    nombre,
    descripcion: (row.Descripcion || row.Descripción || row.descripcion || "").trim(),
    precio: parsePrice(row.Precio || row.precio || "0"),
    precioOferta: parsePrice(row.Precio_Oferta || row.Precio_oferta || row.precio_oferta || "0"),
    imagen: imagenPrincipal,
    imagenes: imagenes,
    categoria,
    activo: row.Activo || row.activo || "",
    slug: nombre && id ? `${slugify(nombre)}-${id}` : "",
    categoriaSlug: categoria ? slugify(categoria) : "",
  };
}

function hasDiscount(p) {
  return p.precioOferta && p.precioOferta > 0 && p.precioOferta < p.precio;
}

function getEffectivePrice(p) {
  return hasDiscount(p) ? p.precioOferta : p.precio;
}

function getDiscountPercent(p) {
  if (!hasDiscount(p)) return 0;
  return Math.round((1 - p.precioOferta / p.precio) * 100);
}

function formatPrice(n) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Recorta una descripción a un largo máximo sin cortar palabras a la mitad,
// para usar en <meta name="description">.
function truncateForMeta(text, maxLen) {
  const clean = (text || "").toString().trim().replace(/\s+/g, " ");
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

const LexmonnShared = {
  PLACEHOLDER_IMG,
  escapeHtml,
  isActive,
  parsePrice,
  slugify,
  parseCSV,
  normalizeProduct,
  hasDiscount,
  getEffectivePrice,
  getDiscountPercent,
  formatPrice,
  truncateForMeta,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = LexmonnShared;
} else {
  window.LexmonnShared = LexmonnShared;
}
