# Memehub

Mis memes favoritos y mi tablero de Pinterest, con buscador por situación.

En línea: https://cacosted.github.io/memehub/

- `memes/` los archivos originales (copiados de `game-vids/images`).
- `thumbs/` miniaturas de 400 px que usa la grilla (se generan solas).
- `data/memes.json` el catálogo: título, categoría, descripción y etiquetas de cada meme. **El buscador solo usa esto.**
- `search.js` el buscador (sinónimos en español, sin IA). Si una búsqueda no encuentra algo obvio, agrega palabras al grupo que corresponda en `GROUPS`.
- `tools/build.mjs` crea miniaturas y entradas para los memes nuevos.

## Agregar memes

**Desde la web de GitHub:** entra a la carpeta `memes/` del repo → *Add file* → *Upload files* → arrastra los memes → *Commit*.
La Action crea la miniatura y una entrada con etiquetas sacadas del nombre del archivo, y publica la página en ~1 min.
Ponles nombres descriptivos (`gato-sorprendido.jpg`, no `IMG_2033.jpg`): de ahí salen las primeras etiquetas.

**Desde la Mac:**

```bash
cp ~/Downloads/nuevo-meme.png memes/
node tools/build.mjs
git add -A && git commit -m "Nuevo meme" && git push
```

Para mejorar las etiquetas, edita su entrada en `data/memes.json` (o pídele a Claude: "etiqueta los memes nuevos de Memehub").

## Tablero de Pinterest (guerra9788/memes)

`data/pinterest.json` tiene los pines del tablero ya etiquetados (`pins`) y los que se descartaron por
duplicados (`skip`). Las imágenes no se copian: se cargan desde `i.pinimg.com`.
La búsqueda los mezcla con tus memes y los marca con una **P**.

- Los **50 pines más recientes** se leen en vivo al abrir la página. Los que todavía no están en el catálogo
  aparecen arriba como **NUEVO** (sin etiquetas buenas hasta que se etiqueten).
- Para meter los pines nuevos en la búsqueda inteligente: pídele a Claude **"actualiza el tablero de Memehub"**.
  El método: recorrer el tablero con sesión iniciada (incluidos los subtableros), bajar las miniaturas de 236 px,
  descartar duplicados comparando cada imagen (hash perceptual) contra los pines y contra `memes/`, mirar los que
  quedan y agregarlos a `pins` (y los duplicados a `skip`).
- Los pines no se pueden copiar ni descargar desde la página (Pinterest no lo permite a otros sitios):
  usa "Abrir en Pinterest" o "Ver imagen grande".
- Si borras un pin del tablero, sigue apareciendo hasta la próxima actualización.

## Quitar un meme

Borra el archivo de `memes/`, su miniatura de `thumbs/` y su entrada en `data/memes.json`.

## Favoritos y "más usados"

Se guardan en el navegador (localStorage): cada navegador/dispositivo tiene los suyos.
"Más usados" cuenta las veces que copias o descargas un meme.

## Probar en local

```bash
python3 -m http.server 8765
```

y abre http://localhost:8765
