// ============================================================
// LEXMONN - Lógica compartida entre el navegador (app.js) y el
// script de build (build.js). No depende del DOM ni de Node,
// así que corre igual en los dos lados.
//
// No necesitas editar este archivo para configurar la tienda.
// ============================================================

// Recuadro "LEXMONN" para un producto sin foto o con la foto rota. Es un
// archivo y no un data URI a propósito: la ruta se repite en el atajo
// onerror de cada imagen (en el catálogo, ~150 veces), y un data URI de
// 600 caracteres ahí engordaba cada página sin ningún beneficio.
const PLACEHOLDER_IMG = "/imagenes/sin-foto.svg";

// ---------- Versiones livianas de las fotos ----------
//
// tools/optimizar-fotos.js genera, por cada foto de producto, copias en WebP
// de 200, 400 y 800 px de ancho en /imagenes/opt/, y la lista de cuáles
// existen en lib/fotos-optimizadas.js. El sitio las ofrece con srcset para
// que cada pantalla baje solo el tamaño que necesita: una tarjeta en celular
// ocupa ~180 px y la foto original puede pesar 400 KB.
//
// Si una foto no tiene versiones (por ejemplo, una recién cargada en la
// Sheet) se usa la original tal cual: se ve igual, solo pesa más hasta que
// se vuelva a correr la herramienta.
const FOTOS_OPT = (function () {
  if (typeof module !== "undefined" && module.exports) {
    try {
      return require("./fotos-optimizadas.js");
    } catch (e) {
      return {};
    }
  }
  return typeof FOTOS_OPTIMIZADAS !== "undefined" ? FOTOS_OPTIMIZADAS : {};
})();

// Nombre con que se guardan las versiones de una foto: el del archivo si está
// en /imagenes/ del sitio, o el código de postimg.cc (único por foto). Las
// fotos de cualquier otro servidor no tienen versiones y se usan tal cual.
function fotoClave(url) {
  const u = (url || "").toString().trim();
  const local = u.match(/^(?:https?:\/\/(?:www\.)?lexmonn\.com)?\/?imagenes\/([^/?#]+)\.(?:jpe?g|png|webp)(?:[?#].*)?$/i);
  if (local) {
    let nombre = local[1];
    try {
      nombre = decodeURIComponent(nombre);
    } catch (e) {
      // un % suelto en el nombre: se usa tal cual
    }
    return slugify(nombre);
  }
  const postimg = u.match(/^https?:\/\/i\.postimg\.cc\/([A-Za-z0-9]+)\//);
  return postimg ? `postimg-${postimg[1]}` : "";
}

// { src, srcset, ampliada, optimizada }: src es la versión más chica que
// cubre `preferido` px de ancho (el respaldo para navegadores sin srcset), y
// srcset la lista completa para que el navegador elija.
//
// `ampliada` es la que se abre en el visor con zoom: la original si está en
// el sitio; si está en postimg.cc, la versión más grande guardada aquí. Esas
// fotos miden 600 u 800 px, así que es la misma resolución, y postimg es
// lento (una foto tardó ~4 s en una prueba) y un servidor ajeno que puede
// caerse.
function fotoVersiones(url, preferido) {
  const clave = fotoClave(url);
  const anchos = clave ? FOTOS_OPT[clave] : null;
  if (!anchos || !anchos.length) return { src: url || "", srcset: "", ampliada: url || "", optimizada: false };
  const archivo = (w) => `/imagenes/opt/${clave}-${w}.webp`;
  const elegido = anchos.find((w) => w >= (preferido || 400)) || anchos[anchos.length - 1];
  return {
    src: archivo(elegido),
    srcset: anchos.map((w) => `${archivo(w)} ${w}w`).join(", "),
    ampliada: clave.startsWith("postimg-") ? archivo(anchos[anchos.length - 1]) : url,
    optimizada: true,
  };
}

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

// Una celda con solo "." o "," es un valor de relleno de quien carga la Sheet,
// no una descripción: mostrarla deja un punto suelto en la tarjeta, en la
// página del producto y en el texto que Google muestra del resultado.
function cleanText(value) {
  const text = (value || "").toString().trim();
  return /^[\s.,;:\-_]*$/.test(text) ? "" : text;
}

// Marcas de reventa que aparecen en los nombres del catálogo. La Sheet no
// tiene columna Marca (decisión del negocio: no agregar trabajo de carga), así
// que se deduce del nombre. Sin esto el JSON-LD le decía a Google que TODO el
// catálogo era marca Lexmonn. "Total" exige la mayúscula para no confundirse
// con la palabra común.
const KNOWN_BRANDS = [
  ["Total", /\bTotal\b/],
  ["Truper", /\btruper\b/i],
  ["DeWalt", /\bdewalt\b/i],
  ["Stanley", /\bstanley\b/i],
  ["Milwaukee", /\bmilwaukee\b/i],
  ["Husky", /\bhusky\b/i],
  ["Marshalltown", /\bmarshalltown\b/i],
  ["Level5", /\blevel\s?5\b/i],
  ["TapeTech", /\btapetech\b/i],
  ["Tajima", /\btajima\b/i],
  ["Pretul", /\bpretul\b/i],
  ["Wadfow", /\bwadfow\b/i],
  ["Energizer", /\benergizer\b/i],
  ["Anvil", /\banvil\b/i],
  ["Arrow", /\barrow\b/i],
  ["Hermex", /\bhermex\b/i],
  ["Empire", /\bempire\b/i],
  ["3M", /\b3M\b/],
  ["Ramset", /\bramset\b/i],
  ["Forte", /\bforte\b/i],
  ["Wal-Board", /\bwal-?board\b/i],
  ["ToolPro", /\btoolpro\b/i],
  ["YesBes", /\byesbes\b/i],
  ["Rankee", /\brankee\b/i],
  ["Leo", /\bleo\b/i],
  ["Lexmonn", /\blexmonn\b/i],
];

function detectBrand(p) {
  if (p.marca) return p.marca;
  const nombre = p.nombre || "";
  // Primero el nombre; si no, la categoría, que a veces es la marca
  // ("Herramientas Total", "LEO PUMP") aunque el nombre no la repita.
  const hit =
    KNOWN_BRANDS.find(([, re]) => re.test(nombre)) ||
    KNOWN_BRANDS.find(([, re]) => re.test(p.categoria || ""));
  if (hit) return hit[0];
  // Porta Herramientas es la única categoría de fabricación propia.
  return p.categoria === "Porta Herramientas" ? "Lexmonn" : "";
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

  const product = {
    id,
    nombre,
    descripcion: cleanText(row.Descripcion || row.Descripción || row.descripcion),
    precio: parsePrice(row.Precio || row.precio || "0"),
    precioOferta: parsePrice(row.Precio_Oferta || row.Precio_oferta || row.precio_oferta || "0"),
    imagen: imagenPrincipal,
    imagenes: imagenes,
    categoria,
    marca: (row.Marca || row.marca || "").trim(),
    activo: row.Activo || row.activo || "",
    slug: nombre && id ? `${slugify(nombre)}-${id}` : "",
    categoriaSlug: categoria ? slugify(categoria) : "",
  };
  product.marca = detectBrand(product);
  return product;
}

// El orden de la Sheet es cosa de quien la edita (por ID, alfabético, como
// convenga) y no debe afectar al visitante: el catálogo siempre se muestra
// ordenado por nombre, sin importar en qué orden vengan las filas.
function sortByNombre(products) {
  return [...products].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
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
  fotoClave,
  fotoVersiones,
  escapeHtml,
  isActive,
  parsePrice,
  slugify,
  parseCSV,
  normalizeProduct,
  cleanText,
  detectBrand,
  sortByNombre,
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
