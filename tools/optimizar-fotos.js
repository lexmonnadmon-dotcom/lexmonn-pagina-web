#!/usr/bin/env node
// ============================================================
// LEXMONN - Versiones livianas de las fotos (WebP)
//
// Las fotos originales pesan de 60 a 400 KB, pero en celular se ven chicas:
// una tarjeta de producto mide ~180 px de ancho y una miniatura de la
// galería, 68. Este script genera, por cada foto de producto, copias en WebP
// de 200, 400 y 800 px de ancho en imagenes/opt/, y la lista
// lib/fotos-optimizadas.js con la que el sitio elige la adecuada para cada
// pantalla (srcset). También las versiones de la foto de portada, el logo,
// el ícono del pie y el pop-up de aniversario (imagenes/opt/sitio/).
//
// Cubre las fotos guardadas en /imagenes/ y las de postimg.cc que aparecen
// en la Sheet. NO toca la Sheet: la foto original sigue siendo la de
// siempre, y es la que usa el sitio si una foto no tiene versión liviana.
//
// Uso:      node tools/optimizar-fotos.js      (solo genera lo que falta)
//           node tools/optimizar-fotos.js --todo   (rehace todo)
//           node tools/optimizar-fotos.js --revisar
//             (no genera nada: sale con código 3 si alguna foto no tiene
//             versión liviana; el workflow de GitHub lo usa para instalar
//             ffmpeg y generarlas solo cuando hay fotos nuevas en la Sheet)
// Después:  node build.js
// Requiere ffmpeg (en Windows: winget install Gyan.FFmpeg).
// ============================================================

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const Shared = require("../lib/shared.js");
const CONFIG = require("../config.js");

const run = promisify(execFile);
const ROOT = path.join(__dirname, "..");
const OPT_DIR = path.join(ROOT, "imagenes", "opt");
const SITIO_DIR = path.join(OPT_DIR, "sitio");
const MANIFIESTO = path.join(ROOT, "lib", "fotos-optimizadas.js");
const CACHE_DIR = path.join(os.tmpdir(), "lexmonn-fotos");
const REHACER = process.argv.includes("--todo");
const SOLO_REVISAR = process.argv.includes("--revisar");

// Anchos de las versiones: 200 para miniaturas y carrito, 400 para tarjetas
// en celular, 800 para la foto grande del producto. Nunca se agranda una
// foto: si la original es más angosta, su ancho real es la versión mayor.
const ANCHOS = [200, 400, 800];
const CALIDAD = 80;

// Imágenes fijas del sitio, con su propio tamaño. El recorte de la portada
// en celular deja exactamente la franja que ya se veía a 360-480 px (el
// instalador con el cinturón), así que no cambia el encuadre, solo el peso.
const FIJAS = [
  { src: "hero-banner-2.jpeg", out: "hero-1600.webp", w: 1600, q: 78 },
  { src: "hero-banner-2.jpeg", out: "hero-1100.webp", w: 1100, q: 78 },
  { src: "hero-banner-2.jpeg", out: "hero-movil-960.webp", w: 960, q: 76, recorte: "1091:682:377:0" },
  { src: "promo-sorteo.jpeg", out: "promo-sorteo-480.webp", w: 480, q: 82 },
  { src: "promo-sorteo.jpeg", out: "promo-sorteo-720.webp", w: 720, q: 76 },
  { src: "promo-sorteo.jpeg", out: "promo-sorteo-960.webp", w: 960, q: 74 },
  { src: "logo-cropped.png", out: "logo-lexmonn-296.webp", w: 296, q: 90, alfa: true },
  { src: "logo-cropped.png", out: "logo-lexmonn-444.webp", w: 444, q: 90, alfa: true },
  { src: "favicon-192.png", out: "lex-icono-112.webp", w: 112, q: 90, alfa: true },
];

const kb = (n) => `${Math.round(n / 1024).toLocaleString("es-CO")} KB`;

// Orientación EXIF de un JPEG (1 = normal). Se lee a mano y se aplica con
// filtros explícitos, con -noautorotate, para no depender de si la versión
// de ffmpeg instalada gira sola o no.
function orientacionExif(buf) {
  if (buf.readUInt16BE(0) !== 0xffd8) return 1;
  let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) return 1;
    const marca = buf[i + 1];
    const largo = buf.readUInt16BE(i + 2);
    if (marca === 0xe1 && buf.toString("latin1", i + 4, i + 10) === "Exif\0\0") {
      const t = i + 10;
      const le = buf.toString("latin1", t, t + 2) === "II";
      const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
      const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    if (marca === 0xda) return 1;
    i += 2 + largo;
  }
  return 1;
}
const GIRO = { 2: "hflip", 3: "hflip,vflip", 4: "vflip", 5: "transpose=0", 6: "transpose=1", 7: "transpose=3", 8: "transpose=2" };

async function medidas(archivo) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", archivo]);
  const [w, h] = stdout.trim().split("x").map(Number);
  return { w, h };
}

async function aWebp(origen, destino, { ancho, calidad, recorte, alfa, giro }) {
  const filtros = [giro, recorte && `crop=${recorte}`, `scale=${ancho}:-1:flags=lanczos`].filter(Boolean).join(",");
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-noautorotate", "-i", origen, "-vf", filtros,
    "-frames:v", "1", "-map_metadata", "-1", "-c:v", "libwebp", "-quality", String(calidad),
    "-compression_level", "6", "-preset", alfa ? "picture" : "photo", ...(alfa ? ["-pix_fmt", "yuva420p"] : []), destino];
  // OneDrive a veces bloquea un archivo recién escrito: un reintento basta.
  try {
    await run("ffmpeg", args);
  } catch (e) {
    await new Promise((r) => setTimeout(r, 800));
    await run("ffmpeg", args);
  }
}

// Corre `tareas` de a `n` a la vez.
async function enParalelo(tareas, n) {
  const resultados = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < tareas.length) {
        const j = i++;
        resultados[j] = await tareas[j]();
      }
    })
  );
  return resultados;
}

async function fotosDeLaSheet() {
  const res = await fetch(CONFIG.SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la Sheet`);
  return Shared.parseCSV(await res.text())
    .map(Shared.normalizeProduct)
    .filter((p) => p.id && Shared.isActive(p.activo))
    .flatMap((p) => p.imagenes);
}

async function descargar(url, clave) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const destino = path.join(CACHE_DIR, `${clave}${path.extname(new URL(url).pathname) || ".jpg"}`);
  if (!fs.existsSync(destino)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
  }
  return destino;
}

async function main() {
  fs.mkdirSync(SITIO_DIR, { recursive: true });

  // 1. Qué fotos hay: las del repositorio y las externas de la Sheet.
  const fuentes = new Map(); // clave -> { url, archivo? }
  for (const f of fs.readdirSync(path.join(ROOT, "imagenes"))) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const url = `/imagenes/${f}`;
    const clave = Shared.fotoClave(url);
    if (fuentes.has(clave)) {
      console.warn(`[fotos] ${f} choca con otra foto del mismo nombre; se usa la primera.`);
      continue;
    }
    fuentes.set(clave, { url, archivo: path.join(ROOT, "imagenes", f) });
  }
  let sinVersion = [];
  try {
    for (const url of await fotosDeLaSheet()) {
      const clave = Shared.fotoClave(url);
      if (!clave) sinVersion.push(url);
      else if (!fuentes.has(clave)) fuentes.set(clave, { url });
    }
  } catch (e) {
    console.warn(`[fotos] No se pudo leer la Sheet (${e.message}): solo se procesan las fotos del repositorio.`);
  }
  sinVersion = [...new Set(sinVersion)];

  if (SOLO_REVISAR) {
    const conVersion = new Set(
      (fs.existsSync(OPT_DIR) ? fs.readdirSync(OPT_DIR) : []).map((f) => (f.match(/^(.+)-\d+\.webp$/) || [])[1]).filter(Boolean)
    );
    const faltan = [...fuentes.keys()].filter((c) => !conVersion.has(c));
    const faltanFijas = FIJAS.filter((f) => !fs.existsSync(path.join(SITIO_DIR, f.out)));
    if (!faltan.length && !faltanFijas.length) {
      console.log(`[fotos] Las ${fuentes.size} fotos tienen versión liviana.`);
      return;
    }
    console.log(`[fotos] ${faltan.length + faltanFijas.length} fotos sin versión liviana: ${[...faltan, ...faltanFijas.map((f) => f.out)].slice(0, 10).join(", ")}`);
    process.exitCode = 3;
    return;
  }

  // 2. Versiones que faltan.
  let generadas = 0;
  let fallidas = 0;
  let pesoOriginal = 0;
  let pesoLiviano = 0;
  const tareas = [...fuentes.entries()].map(([clave, f]) => async () => {
    try {
      const archivo = f.archivo || (await descargar(f.url, clave));
      const buf = fs.readFileSync(archivo);
      const orientacion = /\.jpe?g$/i.test(archivo) ? orientacionExif(buf) : 1;
      const m = await medidas(archivo);
      const anchoReal = orientacion >= 5 ? m.h : m.w;
      const anchos = [...new Set(ANCHOS.map((w) => Math.min(w, anchoReal)))];
      for (const w of anchos) {
        const destino = path.join(OPT_DIR, `${clave}-${w}.webp`);
        if (!REHACER && fs.existsSync(destino)) continue;
        await aWebp(archivo, destino, { ancho: w, calidad: CALIDAD, giro: GIRO[orientacion] });
        generadas++;
      }
      pesoOriginal += buf.length;
      const w400 = path.join(OPT_DIR, `${clave}-${Math.min(400, anchoReal)}.webp`);
      if (fs.existsSync(w400)) pesoLiviano += fs.statSync(w400).size;
    } catch (e) {
      fallidas++;
      console.warn(`[fotos] Falló ${f.url}: ${e.message.split("\n")[0]}`);
    }
  });
  await enParalelo(tareas, 4);

  for (const fija of FIJAS) {
    const destino = path.join(SITIO_DIR, fija.out);
    if (!REHACER && fs.existsSync(destino)) continue;
    await aWebp(path.join(ROOT, fija.src), destino, { ancho: fija.w, calidad: fija.q, recorte: fija.recorte, alfa: fija.alfa });
    generadas++;
  }

  // 3. La lista que usa el sitio: solo lo que de verdad está en disco.
  const lista = {};
  for (const f of fs.readdirSync(OPT_DIR)) {
    const m = f.match(/^(.+)-(\d+)\.webp$/);
    if (!m || !fuentes.has(m[1])) continue;
    (lista[m[1]] = lista[m[1]] || []).push(Number(m[2]));
  }
  const claves = Object.keys(lista).sort();
  const cuerpo = claves.map((c) => `  ${JSON.stringify(c)}: [${lista[c].sort((a, b) => a - b).join(", ")}]`).join(",\n");
  fs.writeFileSync(
    MANIFIESTO,
    `// Generado por tools/optimizar-fotos.js: no se edita a mano.\n` +
      `// Por cada foto, los anchos (px) de sus versiones WebP en /imagenes/opt/.\n` +
      `var FOTOS_OPTIMIZADAS = {\n${cuerpo}\n};\n\n` +
      `if (typeof module !== "undefined" && module.exports) module.exports = FOTOS_OPTIMIZADAS;\n`,
    "utf8"
  );

  console.log(`[fotos] ${fuentes.size} fotos de producto · ${generadas} archivos nuevos · ${fallidas} con error`);
  console.log(`[fotos] Peso de las originales: ${kb(pesoOriginal)} · versión de 400 px: ${kb(pesoLiviano)}`);
  if (sinVersion.length) console.log(`[fotos] ${sinVersion.length} fotos de otros servidores se usan tal cual (solo se optimizan /imagenes/ y postimg.cc).`);
  console.log(`[fotos] Lista escrita en lib/fotos-optimizadas.js (${claves.length} fotos). Falta correr: node build.js`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
