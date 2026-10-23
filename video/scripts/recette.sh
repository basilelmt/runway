#!/usr/bin/env bash
# Relance le serveur de recette de la vidéo sur une base neuve (tmp/video/runway.db), puis la remplit.
# Serveur sur 3100, client sur 5180. Ne touche jamais à data/runway.db.
#
# Captures (docs/media/screens), dans Chrome en 1440×900, facteur 2, mode clair, panneaux de travaux fermés :
#   0. Avant l'import, Accueil (fermer le toast « Tes marchands ») : accueil.png.
#   1. Opérations > Importer un relevé : import-depot.png, puis déposer tmp/video/releve-demo.csv : import-apercu.png.
#   2. Importer, puis À ranger > Trier avec Claude : tri-claude.png, puis Tout accepter
#      (Claude range Leroy Merlin dans Logement, qui passe à découvert : c'est la question de Demander).
#   3. Analyse > À venir, Demander (K), Viser un bloc, survoler la ligne Logement : demander-viseur.png ;
#      cliquer, Échap, taper « Pourquoi je suis dans le rouge ici ? » : demander-question.png ;
#      envoyer : demander-reponse.png ; Appliquer : demander-applique.png.
#   4. Fermer Demander : prevision.png, puis défiler jusqu'à « Solde projeté » : prevision-solde.png.
#   5. Budget : budget.png. Investir : investir.png.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.local/bin:$PATH"
DIR=tmp/video
mkdir -p "$DIR"

stop_port() {
  local pid
  pid=$(ss -ltnpH "sport = :$1" | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "$pid" ]; then kill "$pid"; while ss -ltnH "sport = :$1" | grep -q .; do sleep 0.2; done; fi
}
wait_port() { until curl -sf "http://localhost:$1/api/accounts" > /dev/null; do sleep 0.3; done; }
start_server() {
  RUNWAY_DB=$DIR/runway.db PORT=3100 nohup npx tsx server/src/index.ts >> "$DIR/server.log" 2>&1 &
  wait_port 3100
}

stop_port 3100
rm -rf "$DIR/runway.db" "$DIR/runway.db-wal" "$DIR/runway.db-shm" "$DIR/backups"
start_server
node video/scripts/seed.ts
# Au redémarrage, le serveur crée les occurrences dues des règles récurrentes (Netflix prévu ce mois-ci).
stop_port 3100
start_server

if ! ss -ltnH "sport = :5180" | grep -q .; then
  API_PORT=3100 nohup npx vite --config client/vite.config.ts --port 5180 --strictPort > "$DIR/client.log" 2>&1 &
fi
echo "Recette prête sur http://localhost:5180"
