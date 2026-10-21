#!/usr/bin/env bash
# Rend la vidéo de présentation, son affiche et la boucle GIF du README dans docs/media/.
# Les captures viennent de docs/media/screens (voir scripts/recette.sh pour les refaire).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=../docs/media
TMP=../tmp/video/render
mkdir -p "$OUT" "$TMP"

npx remotion bundle src/index.ts --out-dir "$TMP/bundle" --log=error
npx remotion render "$TMP/bundle" Presentation "$OUT/runway-presentation.mp4" --log=error
# L'affiche : le logo posé sur la piste, une fois l'accroche affichée.
npx remotion still "$TMP/bundle" Presentation "$OUT/poster.png" --frame=104 --log=error
npx remotion render "$TMP/bundle" Teaser "$TMP/teaser.mp4" --log=error

# GIF : 960 px, 15 images par seconde, palette calculée sur la boucle elle-même.
ffmpeg -y -loglevel error -i "$TMP/teaser.mp4" -vf "fps=15,scale=960:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" "$TMP/palette.png"
ffmpeg -y -loglevel error -i "$TMP/teaser.mp4" -i "$TMP/palette.png" -lavfi "fps=15,scale=960:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle" -loop 0 "$OUT/runway-presentation.gif"

ls -lh "$OUT/runway-presentation.mp4" "$OUT/runway-presentation.gif" "$OUT/poster.png"
