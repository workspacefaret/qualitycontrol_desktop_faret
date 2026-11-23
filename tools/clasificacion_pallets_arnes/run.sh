#!/usr/bin/env bash
# Ejecuta el arnés E2E de Clasificación de Pallets en Edge headless (módulo real + puente simulado, sin red a producción).
#   ./run.sh test            → corre los 3 escenarios de pruebas (datos, vacio, error)
#   ./run.sh app             → index.html + app.js REALES: menú por empresa/permisos, Solo vista, _modulo, aislamiento Faret
#   ./run.sh shot <esc> <png> [ancho] [alto]  → captura (escenarios: datos, drawer, vacio, error, anulada, azul)
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
AQUI="$(cd "$(dirname "$0")" && pwd -W)"
URL="file:///$AQUI/harness.html"
PERFIL="$(mktemp -d)"
BASE=(--headless=new --disable-gpu --allow-file-access-from-files --no-first-run --user-data-dir="$PERFIL")

if [ "$1" = "test" ]; then
  rc=0
  for esc in datos vacio error; do
    salida=$("$EDGE" "${BASE[@]}" --virtual-time-budget=90000 --dump-dom "$URL?modo=test&escenario=$esc" 2>/dev/null)
    bloque=$(echo "$salida" | sed -n '/<pre id="out"/,/<\/pre>/p' | sed -e 's/<[^>]*>//g' -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&amp;/\&/g')
    echo "$bloque"
    echo "$bloque" | grep -q " 0 FALLAS" || rc=1
  done
  rm -rf "$PERFIL"
  exit $rc
fi

if [ "$1" = "app" ]; then
  APP="file:///$AQUI/harness_app.html"
  rc=0
  for caso in innpack_editar innpack_rol_sin_anular innpack_ver innpack_sin_acceso faret; do
    salida=$("$EDGE" "${BASE[@]}" --disable-web-security --virtual-time-budget=60000 --dump-dom "$APP?caso=$caso" 2>/dev/null)
    bloque=$(echo "$salida" | sed -n '/<pre id="out"/,/<\/pre>/p' | sed -e 's/<[^>]*>//g' -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&amp;/\&/g')
    echo "$bloque"
    echo "$bloque" | grep -q " 0 FALLAS" || rc=1
  done
  rm -rf "$PERFIL"
  exit $rc
fi

if [ "$1" = "shot" ]; then
  "$EDGE" "${BASE[@]}" --virtual-time-budget=30000 --window-size="${4:-1500},${5:-1100}" --screenshot="$3" "$URL?modo=shot&escenario=$2" >/dev/null 2>&1
  rm -rf "$PERFIL"
  ls -la "$3"
fi
