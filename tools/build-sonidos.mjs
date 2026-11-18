#!/usr/bin/env node
// Prepara los sonidos nuevos para la pestaña Sonidos.
//   node tools/build-sonidos.mjs
// - Agrega a data/sonidos.json una entrada para cada archivo nuevo de sonidos/, con etiquetas
//   sacadas del nombre del archivo (luego puedes mejorarlas a mano o pedírselo a Claude).
// - Calcula la duración y la forma de onda (`wave`: 48 barras en base 36) de los que no la tengan.
// - Avisa de las entradas cuyo archivo ya no existe.
// Necesita ffmpeg/ffprobe (en Mac: brew install ffmpeg). En GitHub lo corre la Action sola.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "sonidos");
const dataFile = join(root, "data", "sonidos.json");
const AUD = new Set([".mp3", ".wav", ".ogg", ".m4a"]);
const BARS = 48;

function duration(path) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  return Math.round(parseFloat(out.toString()) * 100) / 100;
}

// RMS por tramo, normalizado al tramo más fuerte, con raíz para que lo suave se vea.
function wave(path) {
  const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", path, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
    { maxBuffer: 1 << 28 });
  const n = Math.floor(pcm.length / 2);
  const per = Math.max(1, Math.floor(n / BARS));
  const rms = [];
  for (let b = 0; b < BARS; b++) {
    let s = 0, c = 0;
    for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) { const v = pcm.readInt16LE(i * 2); s += v * v; c++; }
    rms.push(c ? Math.sqrt(s / c) : 0);
  }
  const max = Math.max(...rms) || 1;
  return rms.map((v) => Math.round(Math.sqrt(v / max) * 35).toString(36)).join("");
}

const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : [];
const known = new Set(data.map((s) => s.file));
const files = readdirSync(dir).filter((f) => !f.startsWith(".") && AUD.has(extname(f).toLowerCase())).sort();

let added = 0;
for (const f of files) {
  if (known.has(f)) continue;
  const words = basename(f, extname(f)).split(/[-_\s]+/).filter((w) => w && !/^\d+$/.test(w));
  data.push({ file: f, cat: "Sin clasificar", title: words.join(" ") || f, desc: "", tags: words });
  added++;
  console.log("nuevo:", f);
}
for (const s of data) {
  const p = join(dir, s.file);
  if (!existsSync(p)) { console.warn(`OJO: no existe sonidos/${s.file} (quítalo de data/sonidos.json)`); continue; }
  if (s.dur == null) s.dur = duration(p);
  if (!s.wave) s.wave = wave(p);
}

mkdirSync(dirname(dataFile), { recursive: true });
writeFileSync(dataFile, "[\n" + data.map((s) => " " + JSON.stringify(s)).join(",\n") + "\n]\n");
console.log(`${data.length} sonidos en data/sonidos.json (${added} nuevos).`);
