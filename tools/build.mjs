#!/usr/bin/env node
// Prepara los memes nuevos para la página.
//   node tools/build.mjs
// - Crea la miniatura (thumbs/) de cada archivo en memes/ que no tenga una.
// - Agrega a data/memes.json una entrada para cada meme nuevo, con etiquetas
//   sacadas del nombre del archivo (luego puedes mejorarlas a mano o pedírselo a Claude).
// - Avisa de las entradas cuyo archivo ya no existe.
// Necesita ffmpeg (en Mac: brew install ffmpeg). En GitHub lo corre la Action sola.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const memesDir = join(root, "memes");
const thumbsDir = join(root, "thumbs");
const dataFile = join(root, "data", "memes.json");
mkdirSync(thumbsDir, { recursive: true });

const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const VID = new Set([".mov", ".mp4", ".webm"]);

function thumbName(file) {
  const ext = extname(file).toLowerCase();
  const base = basename(file, extname(file));
  // png conserva transparencia; el resto va a jpg
  return `${base}-${ext.slice(1)}.${ext === ".png" ? "png" : "jpg"}`;
}

function makeThumb(file) {
  const out = join(thumbsDir, thumbName(file));
  if (existsSync(out)) return;
  const ext = extname(file).toLowerCase();
  const args = ["-loglevel", "error", "-y"];
  if (VID.has(ext)) args.push("-ss", "0.5");
  args.push("-i", join(memesDir, file), "-frames:v", "1",
    "-vf", "scale='min(400,iw)':'min(400,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2");
  if (!out.endsWith(".png")) args.push("-q:v", "4");
  args.push(out);
  execFileSync("ffmpeg", args);
  console.log("miniatura:", thumbName(file));
}

const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : [];
const known = new Set(data.map((m) => m.file));
const isMedia = (f) => IMG.has(extname(f).toLowerCase()) || VID.has(extname(f).toLowerCase());
const files = readdirSync(memesDir).filter((f) => !f.startsWith(".") && isMedia(f)).sort();

let added = 0;
for (const f of files) {
  makeThumb(f);
  if (known.has(f)) continue;
  const ext = extname(f).toLowerCase();
  const words = basename(f, extname(f)).split(/[-_\s]+/).filter((w) => w && !/^\d+$/.test(w));
  data.push({
    file: f,
    thumb: thumbName(f),
    type: VID.has(ext) ? "video" : ext === ".gif" ? "gif" : "imagen",
    cat: "Sin clasificar",
    title: words.join(" ") || f,
    desc: "",
    tags: words,
  });
  added++;
  console.log("nuevo:", f);
}

for (const m of data) {
  m.thumb = thumbName(m.file);
  if (!files.includes(m.file)) console.warn(`OJO: no existe memes/${m.file} (quítalo de data/memes.json)`);
}

mkdirSync(dirname(dataFile), { recursive: true });
writeFileSync(dataFile, JSON.stringify(data, null, 1) + "\n");
console.log(`${data.length} memes en data/memes.json (${added} nuevos).`);
