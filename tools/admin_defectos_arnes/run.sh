#!/usr/bin/env bash
# Arnés E2E del panel "Administración de planta > Formularios" (módulo real + puente simulado, sin red a producción).
#   ./run.sh test                    -> corre las comprobaciones
#   ./run.sh shot <png> [ancho] [alto] [pestaña]  -> captura (pestañas: def_calidad, def_pt, chk_pallet, modal)
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
AQUI="$(cd "$(dirname "$0")" && pwd -W)"
URL="file:///$AQUI/harness.html"
PERFIL="$(mktemp -d)"
BASE=(--headless=new --disable-gpu --allow-file-access-from-files --no-first-run --user-data-dir="$PERFIL")
if [ "$1" = "test" ]; then
  salida=$("$EDGE" "${BASE[@]}" --virtual-time-budget=60000 --dump-dom "$URL?modo=test" 2>/dev/null)
  bloque=$(echo "$salida" | sed -n '/<pre id="out"/,/<\/pre>/p' | sed -e 's/<[^>]*>//g' -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&amp;/\&/g')
  echo "$bloque" | grep -E "^(FALLA|ERROR|RESULTADO)"; rm -rf "$PERFIL"
  echo "$bloque" | grep -q " 0 FALLAS"
  exit $?
fi
if [ "$1" = "shot" ]; then
  "$EDGE" "${BASE[@]}" --virtual-time-budget=30000 --window-size="${3:-1500},${4:-950}" --screenshot="$2" "$URL?modo=shot&pestana=${5:-def_calidad}" >/dev/null 2>&1
  rm -rf "$PERFIL"; ls -la "$2"
fi
