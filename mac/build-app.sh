#!/bin/bash
# Compila Memehub.app y, con --instalar, la copia a ~/Applications.
# La app no lleva la web adentro: la lee directo de esta carpeta (así ve los memes nuevos sin recompilar).
# Si mueves la carpeta del repo, vuelve a correr este script.
# Uso: bash mac/build-app.sh --instalar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
APP="$BUILD/Memehub.app"
INSTALL_DIR="$HOME/Applications"

rm -rf "$APP" "$BUILD/Memehub.iconset"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "› Compilando la app…"
clang -fobjc-arc -O2 -mmacosx-version-min=13.0 -Wall \
  -DMEMEHUB_ROOT="\"$ROOT\"" \
  -o "$APP/Contents/MacOS/Memehub" "$ROOT/mac/main.m" \
  -framework Cocoa -framework WebKit -framework UniformTypeIdentifiers
cp "$ROOT/mac/Info.plist" "$APP/Contents/Info.plist"

echo "› Dibujando el icono…"
clang -fobjc-arc -O2 -mmacosx-version-min=13.0 -o "$BUILD/make-icon" "$ROOT/mac/make-icon.m" -framework Cocoa
"$BUILD/make-icon" "$BUILD/icon-1024.png"
ICONSET="$BUILD/Memehub.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$BUILD/icon-1024.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$BUILD/icon-1024.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Memehub.icns"

codesign --force --deep --sign - "$APP" >/dev/null 2>&1
echo "✓ $APP"

if [[ "${1:-}" == "--instalar" ]]; then
  if pgrep -xq Memehub; then
    echo "› Cerrando Memehub para reemplazarla…"
    osascript -e 'tell application id "com.cacosted.memehub" to quit' >/dev/null 2>&1 || true
    sleep 1
  fi
  mkdir -p "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR/Memehub.app"
  ditto "$APP" "$INSTALL_DIR/Memehub.app"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$INSTALL_DIR/Memehub.app" >/dev/null 2>&1 || true
  echo "✓ Instalada en $INSTALL_DIR/Memehub.app"
fi
