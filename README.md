# Memehub

Mis memes favoritos para los videos, con buscador por situación y mi tablero de Pinterest en vivo.

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
