"use strict";

// Datos del listado de Google (productos-google.xml) que se calculan en cada
// build: título, introducción de la descripción, categoría de Google y código
// de fabricante. Se hacen aquí, y no en la Sheet, porque por decisión del
// negocio la Sheet no suma columnas de carga.
//
// Por qué existe. El 2026-11-24 se midió cómo sale Lexmonn en Google Shopping
// SIN poner "lexmonn" en la búsqueda, como lo haría un cliente que no conoce
// la marca. Con marca y modelo del fabricante salía arriba (puestos 1 a 3),
// pero con búsquedas genéricas casi no salía: "porta herramientas" en el
// puesto 95 de 129 y "cargaderas acolchadas" en ninguno. Los productos
// propios se llaman "Línea Estándar" o "Bolsillo multiusos": el título no dice
// qué son, y Google empareja casi todo por el título. Aquí se les da un
// título que sí lo dice, solo en el listado de Google: los nombres del sitio
// no cambian.
//
// Los títulos de abajo son de reventa y propios, y solo dicen lo que la
// descripción de cada producto ya dice (compartimientos, voltaje, batería...).
// Cada ajuste guarda el nombre que el producto tiene hoy en la Sheet; si
// alguien lo cambia, el ajuste se ignora y el build avisa, para que un título
// viejo no se quede pegado a un producto que ya es otro.

const MAX_TITULO = 150; // límite de Google

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// ---------- Ajustes por producto (ID de la Sheet) ----------
//
// nombre: el nombre actual en la Sheet (candado contra ajustes viejos)
// titulo: título para Google (la palabra que busca el cliente va primero y la
//         marca, que casi nadie busca, al final)
// intro:  frase que se antepone a la descripción de la Sheet
// mpn:    código del fabricante cuando está en el nombre
const AJUSTES = {
  // --- Porta herramientas de fabricación propia ---
  146: {
    nombre: "Línea Estándar",
    titulo: "Cinturón Porta Herramientas Línea Estándar con 15 Compartimientos Lexmonn",
    intro: "Cinturón porta herramientas Línea Estándar, fabricado en Colombia por Lexmonn.",
  },
  147: {
    nombre: "Línea Junior",
    titulo: "Cinturón Porta Herramientas Línea Junior Acolchado con 13 Compartimientos Lexmonn",
    intro: "Cinturón porta herramientas acolchado Línea Junior, fabricado en Colombia por Lexmonn.",
  },
  153: {
    nombre: "Línea Práctica",
    titulo: "Porta Herramientas Línea Práctica para Herramientas Livianas, 13 Compartimientos Lexmonn",
    intro: "Porta herramientas Línea Práctica, fabricado en Colombia por Lexmonn.",
  },
  148: {
    nombre: "Línea Premium",
    titulo: "Porta Herramientas Línea Premium Profesional, Tela Antifluido, 15 Compartimientos Lexmonn",
    intro: "Porta herramientas profesional Línea Premium, fabricado en Colombia por Lexmonn.",
  },
  151: {
    nombre: "Bolsillo multiusos",
    titulo: "Bolsillo Porta Herramientas Multiusos con 6 Compartimientos Lexmonn",
    intro: "Bolsillo porta herramientas multiusos, fabricado en Colombia por Lexmonn.",
  },
  154: {
    nombre: "Bolsillo para accesorios piernero",
    titulo: "Bolsillo Piernero Porta Herramientas y Accesorios, 10 Compartimientos, Correa Ajustable Lexmonn",
    intro: "Bolsillo piernero porta herramientas y accesorios, fabricado en Colombia por Lexmonn.",
  },
  152: {
    nombre: "Bolsillo para electricos",
    titulo: "Bolsillo Porta Herramientas para Eléctricos con 15 Compartimientos, para Cinturón de Trabajo Lexmonn",
    intro: "Bolsillo porta herramientas para eléctricos, fabricado en Colombia por Lexmonn.",
  },
  149: {
    nombre: "Cargaderas Acolchadas Lexmonn",
    titulo: "Cargaderas Acolchadas para Cinturón Porta Herramientas con Bolsillo para Celular Lexmonn",
    intro: "Cargaderas acolchadas para cinturón porta herramientas, fabricadas en Colombia por Lexmonn.",
  },
  65: {
    nombre: "Bolso de mano Lexmonn Con Cargadera",
    titulo: "Bolso de Mano para Herramientas con Cargadera y Múltiples Bolsillos Lexmonn",
    intro: "Bolso de mano para herramientas con cargadera, fabricado en Colombia por Lexmonn.",
  },
  44: {
    nombre: "Morral Porta Herramientas Lexmonn",
    titulo: "Morral Porta Herramientas Reforzado con Compartimentos, Portabotellas y Cintas Reflectivas Lexmonn",
  },
  150: {
    nombre: "Porta Taladro Lexmonn",
    titulo: "Porta Taladro con Espacios para Herramientas y Accesorios Lexmonn",
    intro: "Porta taladro, fabricado en Colombia por Lexmonn.",
  },

  // --- Reventa: el nombre de la Sheet no dice qué es o le falta lo que la
  // descripción sí dice ---
  90: {
    nombre: "Atornillador de Impacto 20V Total",
    titulo: "Atornillador de Impacto Inalámbrico 20V Brushless 285 N.m con 2 Baterías y Maletín Total",
  },
  82: {
    nombre: "Batería 20V 4.0Ah Total",
    titulo: "Batería de Litio 20V 4.0Ah Total Tecnología Share TFBLI20021",
  },
  86: {
    nombre: "Sopladora 3 Velocidades Total",
    titulo: "Sopladora Inalámbrica 20V Brushless de 3 Velocidades Total (Sin Batería)",
  },
  54: {
    nombre: "Taladro Chuck 12V Total",
    titulo: "Taladro Inalámbrico 12V Chuck 10 mm con Batería 1.5Ah Total",
  },
  100: {
    nombre: "Cautín Tipo Pluma 60W NA",
    titulo: "Cautín Tipo Pluma 60W 220V con Mango Amarillo",
  },
  159: {
    nombre: "LIJADORA DE PARED Y PISO 1050W INDUSTRIAL TOTAL",
    titulo: "Lijadora Telescópica para Drywall, Pared y Piso 1050W Industrial Total",
  },
  156: {
    nombre: "Bomba Periférica (APM37A)",
    titulo: "Bomba Periférica Leo APM37A de 0.5 HP Monofásica 110V",
    mpn: "APM37A",
  },
  161: {
    nombre: 'Bandeja de acero inoxidable de 12"',
    titulo: "Bandeja de Acero Inoxidable 12 Pulgadas para Drywall con Mango Antideslizante",
  },
  93: {
    nombre: "Sierra Circular Industrial 1600W 185mm Total",
    titulo: "Sierra Circular Industrial 7 1/4 Pulgadas 1600W 185mm Total",
  },
  163: {
    nombre: "Emplacador para drywall Makita XSF03",
    mpn: "XSF03",
  },
};

function ajusteDe(p) {
  const a = AJUSTES[p.id];
  return a && norm(a.nombre) === norm(p.nombre) ? a : null;
}

// ---------- Limpieza general de títulos ----------

const MENORES = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "o", "para", "con", "en", "a", "por", "un", "una", "sin"]);

function capitalizar(texto) {
  return texto
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (/\d/.test(w)) {
        return w.replace(/(\d)(w|v|hp)\b/g, (_, n, u) => n + u.toUpperCase()).replace(/(\d)ah\b/g, "$1Ah");
      }
      if (i > 0 && MENORES.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// Para los nombres que no tienen un ajuste propio: un "NA" pegado al final es
// relleno de la Sheet ("no aplica") y un título todo en mayúsculas lo trata
// Google como texto descuidado.
function limpiarNombre(nombre) {
  let t = String(nombre || "").replace(/\s+/g, " ").trim();
  t = t.replace(/\s+NA$/, "");
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (letras.length >= 6 && letras === letras.toUpperCase()) t = capitalizar(t);
  return t;
}

function titulo(p) {
  const a = ajusteDe(p);
  const t = a && a.titulo ? a.titulo : limpiarNombre(p.nombre);
  return t.length <= MAX_TITULO ? t : p.nombre;
}

function descripcion(p, base) {
  const a = ajusteDe(p);
  return a && a.intro ? `${a.intro} ${base}` : base;
}

// ---------- Categoría de Google ----------
//
// IDs de la taxonomía oficial de Google (taxonomy-with-ids.en-US.txt, versión
// 2021-09-21). Se asigna solo cuando el nombre lo dice sin duda; en los
// demás Google la deduce solo, que es mejor que una categoría equivocada. Gana
// la primera regla que coincide, así que el orden importa. "" = dejar que
// Google decida.
const PROPIOS = [
  [/^linea |^bolsillo|^cargaderas/, "2485"], // Hardware > Tool Storage & Organization > Tool & Equipment Belts
  [/^bolso|^morral/, "6876"], // ... > Tool Bags
  [/^porta taladro/, "4031"], // ... > Tool Sheaths
];

const CATEGORIAS = [
  [/placa de punteria/, "5526"], // Tool Accessories > Measuring Tool & Sensor Accessories
  [/tipo resorte|tapizadora|gancho/, ""], // ambiguos
  [/kit cargador|bateria/, "6295"], // Tool Accessories > Power Tool Batteries
  [/combo|kit taladro percutor y atornillador/, "4716"], // Tools > Tool Sets > Power Tool Combo Sets
  [/atornillador de impacto/, "1221"], // Tools > Impact Wrenches & Drivers
  [/rotomartillo|taladro/, "2629"], // Tools > Drills > Handheld Power Drills
  [/sierra circular/, "3224"], // Tools > Saws > Handheld Circular Saws
  [/serrucho|arco de segueta/, "3594"], // Tools > Saws > Hand Saws
  [/pulidora angular/, "1219"], // Tools > Grinders
  [/lijadora manual/, "4419"], // Tools > Sanding Blocks
  [/lijadora/, "1188"], // Tools > Sanders
  [/pistola de calor/, "1220"], // Tools > Heat Guns
  [/pistola de pintura/, "2465"], // Tools > Paint Tools > Paint Sprayers
  [/pistola de fijacion|grapadora/, "1206"], // Tools > Nailers & Staplers
  [/grapas/, "2380"], // Tool Accessories > Industrial Staples
  [/brocha/, "1300"], // Tools > Paint Tools > Paint Brushes
  [/cautin/, "1236"], // Tools > Soldering Irons
  [/flexometro/, "2481"], // Measuring Tools & Sensors > Tape Measures
  [/nivel/, "1191"], // Measuring Tools & Sensors > Levels (incluye láser)
  [/escuadra/, "1205"], // Measuring Tools & Sensors > Squares
  [/alicate|pinza/, "1958"], // Tools > Pliers
  [/destornillador/, "1203"], // Tools > Screwdrivers
  [/llave ajustable/, "1632"], // Tools > Wrenches
  [/martillo/, "2208"], // Tools > Hammers > Manual Hammers
  [/cuchillas|hojas dentadas/, "2174"], // Tool Accessories > Tool Blades
  [/bisturi|navaja|cutter/, "2411"], // Tools > Cutters > Utility Knives
  [/tijera de aviacion/, "1454"], // Cutters > Handheld Metal Shears & Nibblers
  [/espatula/, "1202"], // Tools > Putty Knives & Scrapers
  [/llana|palustre/, "2181"], // Masonry Tools > Masonry Trowels
  [/cortadora manual de baldosas/, "2726"], // Cutters > Tile & Shingle Cutters
  [/set de herramientas/, "6965"], // Tool Sets > Hand Tool Sets
  [/linterna/, "338"], // Tools > Flashlights & Headlamps
  [/broca/, "1540"], // Drill & Screwdriver Accessories > Bits
  [/disco de lija|discos de lija|lija de agua|esponja de lijado/, "3240"], // Sanding Accessories > Sandpaper & Sponges
  [/disco de corte|disco de desbaste|disco diamantado/, "499859"], // Tool Accessories > Grinder Accessories
  [/gafas/, "2227"], // Work Safety Protective Gear > Protective Eyewear
  [/casco/, "2723"], // ... > Hardhats
  [/guantes/, "5591"], // ... > Safety Gloves
  [/chaleco/, "2047"], // ... Work Safety Protective Gear
  [/candado/, "1027"], // Cycling > Bicycle Accessories > Bicycle Locks
  [/bomba/, "500096"], // Hardware > Hardware Pumps
  [/sopladora/, "3340"], // Lawn & Garden > Outdoor Power Equipment > Leaf Blowers
  [/mezclador/, "499886"], // Tool Accessories > Mixing Tool Paddles
];

function categoriaGoogle(p) {
  const n = norm(p.nombre);
  const reglas = p.marca === "Lexmonn" ? PROPIOS : CATEGORIAS;
  const hit = reglas.find(([re]) => re.test(n));
  return hit ? hit[1] : "";
}

// ---------- Código del fabricante (MPN) ----------
//
// Solo donde el código ya está escrito en el nombre o en la descripción
// ("Modelo TFBLI20021", "Referencia 5-334"). Nunca se inventa uno: un código
// equivocado es peor que ninguno. Sin marca no sirve, así que los productos
// sin marca y los propios no lo llevan.
function codigoFabricante(p) {
  if (!p.marca || p.marca === "Lexmonn") return "";
  const a = ajusteDe(p);
  if (a && a.mpn) return a.mpn;
  const m = (p.descripcion || "").match(/\b(?:modelo|referencia)\s+([A-Za-z0-9][A-Za-z0-9.\-]*)/i);
  if (!m) return "";
  const cod = m[1].replace(/[.\-]+$/, "");
  return /\d/.test(cod) && cod.length >= 3 ? cod : "";
}

// Avisos para el build: ajustes que ya no corresponden a ningún producto.
function avisos(activeProducts) {
  const porId = new Map(activeProducts.map((p) => [String(p.id), p]));
  return Object.keys(AJUSTES).flatMap((id) => {
    const p = porId.get(id);
    if (!p) return [`ajuste del ID ${id} (${AJUSTES[id].nombre}) sin producto activo en la Sheet`];
    return ajusteDe(p)
      ? []
      : [`ajuste del ID ${id} ignorado: el nombre en la Sheet cambió de "${AJUSTES[id].nombre}" a "${p.nombre}"`];
  });
}

module.exports = { titulo, descripcion, categoriaGoogle, codigoFabricante, avisos };
