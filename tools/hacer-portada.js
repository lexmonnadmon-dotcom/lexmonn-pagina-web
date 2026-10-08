#!/usr/bin/env node
// ============================================================
// LEXMONN - Portada de una categoría (mosaico de la portada)
//
// Toma la foto de un producto, recorta el producto, lo centra en un lienzo
// blanco 4:3 de 800x600 y lo guarda como imagenes/portada-<categoría>.jpg.
// Así todas las baldosas del mosaico muestran el producto al mismo tamaño, y
// la portada no cambia si la Sheet cambia la foto de ese producto.
//
// Sirve con fotos de estudio sobre fondo blanco (las de los productos). El
// sitio dibuja la portada con "multiply" sobre el gris de la baldosa, así que
// el blanco desaparece.
//
// Uso:      node tools/hacer-portada.js <categoría> <foto>
//             <categoría>  el nombre ("Herramientas Total") o su slug
//             <foto>       ruta de un JPG/PNG, o una dirección https://
// Después:  node tools/optimizar-fotos.js   (versiones livianas)
//           node build.js
// Si es una categoría nueva, falta poner su portada en CATEGORIA_PRESENTACION
// (build.js). Las que ya existen se actualizan solas con el mismo nombre.
// Requiere ffmpeg (en Windows: winget install Gyan.FFmpeg).
// ============================================================

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const Shared = require("../lib/shared.js");

const run = promisify(execFile);
const ROOT = path.join(__dirname, "..");
const TMP = path.join(os.tmpdir(), "lexmonn-portadas");

const W = 800;
const H = 600;
const CAJA_W = 700; // lo más ancho que puede verse el producto
const CAJA_H = 540; // y lo más alto
const MAX_AGRANDAR = 1.3; // una foto chica no se agranda más que esto
const FONDO = 240; // un pixel más claro que esto es fondo
const RUIDO = 3; // una fila o columna con menos pixeles oscuros que esto es ruido

const ffmpeg = (args, opts) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 200e6, ...opts });

async function medidas(archivo) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", archivo]);
  const [w, h] = stdout.trim().split("x").map(Number);
  return { w, h };
}

// Recuadro del producto: las filas y columnas que tienen pixeles que no son fondo.
async function recuadro(png, w, h) {
  const { stdout } = await ffmpeg(["-i", png, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { encoding: "buffer" });
  const filas = new Array(h).fill(0);
  const cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (stdout[y * w + x] < FONDO) {
        filas[y]++;
        cols[x]++;
      }
    }
  }
  const primero = (a) => a.findIndex((n) => n >= RUIDO);
  const ultimo = (a) => a.length - 1 - [...a].reverse().findIndex((n) => n >= RUIDO);
  return { x0: primero(cols), x1: ultimo(cols), y0: primero(filas), y1: ultimo(filas) };
}

async function main() {
  const [categoria, foto] = process.argv.slice(2);
  if (!categoria || !foto) {
    console.error("Uso: node tools/hacer-portada.js <categoría> <foto>");
    process.exit(1);
  }
  const slug = Shared.slugify(categoria);
  fs.mkdirSync(TMP, { recursive: true });

  let origen = foto;
  if (/^https?:\/\//i.test(foto)) {
    const res = await fetch(foto, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} al bajar la foto`);
    origen = path.join(TMP, `${slug}-origen`);
    fs.writeFileSync(origen, Buffer.from(await res.arrayBuffer()));
  } else if (!fs.existsSync(origen)) {
    throw new Error(`No existe la foto: ${origen}`);
  }

  // Se pasa a PNG primero para que ffmpeg aplique la orientación EXIF y las
  // medidas coincidan con lo que se recorta.
  const norm = path.join(TMP, `${slug}-n.png`);
  await ffmpeg(["-i", origen, "-frames:v", "1", norm]);
  const { w, h } = await medidas(norm);
  const r = await recuadro(norm, w, h);
  if (r.x0 < 0 || r.y0 < 0) throw new Error("No se encontró el producto: ¿la foto es toda blanca?");
  const pw = r.x1 - r.x0 + 1;
  const ph = r.y1 - r.y0 + 1;
  const s = Math.min(CAJA_W / pw, CAJA_H / ph, MAX_AGRANDAR);
  const ow = Math.round((pw * s) / 2) * 2;
  const oh = Math.round((ph * s) / 2) * 2;

  const salida = path.join(ROOT, "imagenes", `portada-${slug}.jpg`);
  // curves: lo casi blanco pasa a blanco puro, para que el borde de la foto no
  // se note contra el gris de la baldosa.
  const vf = `crop=${pw}:${ph}:${r.x0}:${r.y0},scale=${ow}:${oh}:flags=lanczos,curves=all='0/0 0.93/0.93 0.97/1 1/1',pad=${W}:${H}:${Math.floor((W - ow) / 2)}:${Math.floor((H - oh) / 2)}:white`;
  await ffmpeg(["-i", norm, "-vf", vf, "-frames:v", "1", "-map_metadata", "-1", "-q:v", "3", "-pix_fmt", "yuvj420p", salida]);

  console.log(`[portada] ${path.relative(ROOT, salida)}: producto ${pw}x${ph} de una foto de ${w}x${h}, a ${ow}x${oh} (x${s.toFixed(2)}), ${Math.round(fs.statSync(salida).size / 1024)} KB`);
  console.log("[portada] Falta: node tools/optimizar-fotos.js y node build.js");
}

main().catch((e) => {
  console.error(`[portada] ${e.message.split("\n")[0]}`);
  process.exit(1);
});
