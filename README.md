# Memehub

Mis memes favoritos, mi tablero de Pinterest y mis efectos de sonido, con buscador por situación.

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

## App de Mac (arrastrar a Resolve)

`Memehub.app` (en `~/Applications`) es la misma página en una ventana propia, con una diferencia: lo que arrastras
sale como un archivo de verdad, igual que desde el Finder. Lo puedes soltar en el Media Pool o en el timeline de Resolve,
en el Finder o en Photopea. Sirve para los memes y para la pestaña Sonidos.

- Lee todo directo de esta carpeta: los memes nuevos aparecen sin recompilar.
- Los pines de Pinterest (**P**) no están en el disco: se bajan a `descargados/` con **↓** o al arrastrarlos
  (la imagen original; queda marcado con ✓). `descargados/` no se sube a git.
- En la app, ⧉ copia el archivo y la imagen, y el icono de carpeta lo muestra en el Finder.
  *Ventana > Mantener encima* (⌥⌘T) la deja flotando sobre Resolve.

Para compilarla e instalarla (después de cambiar `mac/` o si mueves esta carpeta):

```bash
bash mac/build-app.sh --instalar
```

La primera vez, macOS pide permiso para que lea Documentos: dale *Permitir*.

**En otra Mac** (la app no se copia sola: lee los memes de esta carpeta, así que cada Mac necesita su copia del repo):

```bash
xcode-select --install
git clone https://github.com/cacosted/memehub.git ~/Documents/game-vids/memes-web
bash ~/Documents/game-vids/memes-web/mac/build-app.sh --instalar
```

El primer comando instala el compilador de Apple (si ya está, avisa y no hace nada). Para traer memes y pines nuevos
después: `git -C ~/Documents/game-vids/memes-web pull` (no hace falta recompilar). Los pines bajados (`descargados/`)
son de cada Mac.

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

## Sonidos (pestaña Sonidos)

- `sonidos/` los efectos en mp3: los de `game-vids/sounds`, los gritos y jingles cortos de las carpetas `sounds/`
  de cada video y el pack retro de Juhani Junkala (CC0, libre de derechos: salen con la marca **CC0**).
  Se dejó fuera la música de fondo y los OST completos.
- `data/sonidos.json` el catálogo: título, categoría, descripción, etiquetas, duración (`dur`) y forma de onda (`wave`).
- `tools/build-sonidos.mjs` agrega los sonidos nuevos con etiquetas sacadas del nombre y calcula duración y onda.

**Agregar:** sube el mp3 a `sonidos/` desde la web de GitHub (la Action hace el resto) o, desde la Mac:

```bash
cp ~/Downloads/nuevo-efecto.mp3 sonidos/
node tools/build-sonidos.mjs
git add -A && git commit -m "Nuevo sonido" && git push
```

Para que la búsqueda lo encuentre por situación, mejora sus etiquetas en `data/sonidos.json` (o pídele a Claude:
"etiqueta los sonidos nuevos de Memehub"). En la página: clic para oír, ↓/↑ para ir oyendo, clic en la onda para saltar,
↓ para descargar o arrastra la tarjeta al Finder (Chrome).

## Quitar un meme

Borra el archivo de `memes/`, su miniatura de `thumbs/` y su entrada en `data/memes.json`.

## Favoritos y "más usados"

Los de memes y los de sonidos se guardan en el navegador (localStorage): cada navegador/dispositivo tiene los suyos.
"Más usados" cuenta las veces que copias o descargas un meme.

## Probar en local

```bash
python3 -m http.server 8765
```

y abre http://localhost:8765
