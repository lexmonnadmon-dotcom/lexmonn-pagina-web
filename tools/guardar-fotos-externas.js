#!/usr/bin/env node
// ============================================================
// LEXMONN - Copia de las fotos que están en otro servidor
//
// Gimena sube algunas fotos de producto a postimg.cc y pone su dirección en
// la Sheet. El sitio las muestra bien (usa versiones livianas guardadas aquí),
// pero lo que ve Google (el listado de Merchant Center y los datos de cada
// producto) y la vista previa al compartir un enlace sí piden la foto original
// a postimg, y si ese servidor se cae (pasó el 2026-09-29) esos productos
// quedan sin foto. Este script guarda una copia de cada una en
// imagenes/externas/<código>.<extensión>, y build.js usa la copia para esas
// cosas (ver fotoPublica en build.js). La Sheet no se toca.
//
// Solo baja las que todavía no están guardadas, así que se puede correr las
// veces que sea. El workflow de GitHub lo corre en cada publicación para las
// fotos nuevas; conviene correrlo en local de vez en cuando y hacer commit,
// para que quede guardado en el repositorio y no se vuelva a bajar.
//
// Uso:      node tools/guardar-fotos-externas.js
// Después:  node build.js
// ============================================================

const fs = require("fs");
const path = require("path");

const Shared = require("../lib/shared.js");
const CONFIG = require("../config.js");

const ROOT = path.join(__dirname, "..");
const DESTINO = path.join(ROOT, "imagenes", "externas");

// Tope de espera por descarga: cuando postimg no responde, cada foto se
// quedaría colgada (ver tools/optimizar-fotos.js).
const ESPERA_MAXIMA_MS = 30000;
const A_LA_VEZ = 4;

// Que de verdad sea una imagen: un servidor caído o un aviso de error responde
// con HTML, y guardarlo como .jpg dejaría la foto "guardada" pero rota.
function esImagen(buf) {
  if (buf.length < 1000) return false;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG";
  const webp = buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

// Corre `tareas` de a `n` a la vez.
async function enParalelo(tareas, n) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < tareas.length) await tareas[i++]();
    })
  );
}

async function fotosDeLaSheet() {
  const res = await fetch(CONFIG.SHEET_CSV_URL, { cache: "no-store", signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la Sheet`);
  return Shared.parseCSV(await res.text())
    .map(Shared.normalizeProduct)
    .filter((p) => p.id && Shared.isActive(p.activo))
    .flatMap((p) => [p.imagen, ...p.imagenes]);
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });

  // Una foto por archivo de destino (el código de postimg es único por foto).
  // En Windows dos nombres que solo difieren en mayúsculas serían el mismo
  // archivo: se avisa en vez de pisar una con otra.
  const porNombre = new Map();
  for (const url of new Set((await fotosDeLaSheet()).filter(Boolean))) {
    const ruta = Shared.copiaLocalFoto(url);
    if (!ruta) continue;
    const nombre = path.basename(ruta);
    const choque = [...porNombre.keys()].find((n) => n !== nombre && n.toLowerCase() === nombre.toLowerCase());
    if (choque) {
      console.warn(`[externas] ${nombre} choca con ${choque} (solo difieren en mayúsculas); se omite.`);
      continue;
    }
    if (!porNombre.has(nombre)) porNombre.set(nombre, url);
  }

  let nuevas = 0;
  let yaEstaban = 0;
  let fallidas = 0;
  let bytes = 0;
  const tareas = [...porNombre].map(([nombre, url]) => async () => {
    const destino = path.join(DESTINO, nombre);
    if (fs.existsSync(destino)) {
      yaEstaban++;
      return;
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!esImagen(buf)) throw new Error("lo que llegó no es una imagen");
      fs.writeFileSync(destino, buf);
      nuevas++;
      bytes += buf.length;
    } catch (e) {
      fallidas++;
      console.warn(`[externas] Falló ${url}: ${e.message.split("\n")[0]}`);
    }
  });
  await enParalelo(tareas, A_LA_VEZ);

  console.log(
    `[externas] ${porNombre.size} fotos de otros servidores · ${yaEstaban} ya guardadas · ${nuevas} nuevas (${Math.round(bytes / 1024)} KB) · ${fallidas} con error`
  );
}

main().catch((e) => {
  console.error(`[externas] ${e.message.split("\n")[0]}`);
  process.exit(1);
});
