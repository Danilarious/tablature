#!/usr/bin/env bash
# Starts BxB Music Notebook locally (if not already running) and opens it in the browser.
# Portable: the repository location is derived from this script's own path.
#
#   scripts/launch-app.sh          # local only: http://127.0.0.1:3000 (default, recommended)
#   scripts/launch-app.sh --lan    # ALSO reachable from other devices on your network/tailnet.
#                                  # There is NO application login: anyone who can reach the
#                                  # port can read and change your notebook. See README.
#
# Safety:
#  - Must be run from an interactive terminal. Automated/non-interactive callers (IDE tasks,
#    agents, cron) are refused unless they pass --yes explicitly.
#  - If the notebook database needs a schema migration, the launcher stops and asks you to
#    confirm; it then runs `npm run db:migrate` (complete backup first) before starting.
#    It never migrates silently and never seeds or restores anything.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-3000}"

# Common Node install locations for GUI launchers that start with a minimal PATH.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

MODE="dev"
CONFIRMED=0
for arg in "$@"; do
  case "$arg" in
    --lan) MODE="dev:lan" ;;
    --yes) CONFIRMED=1 ;;
    *) echo "Unknown option: $arg (use --lan and/or --yes)"; exit 2 ;;
  esac
done

INTERACTIVE=0
if [ -t 0 ] && [ -t 1 ]; then INTERACTIVE=1; fi
if [ "$INTERACTIVE" -ne 1 ] && [ "$CONFIRMED" -ne 1 ]; then
  echo "Refusing to start: not running in an interactive terminal."
  echo "Run scripts/launch-app.sh yourself, or pass --yes if you really intend automation to start the app."
  exit 2
fi

cd "$PROJECT_DIR" || exit 1

# Resolve the data directory using the same dotenv precedence as Next.js so the launcher
# and the server always agree on which database to open.  scripts/resolve-env.cjs delegates
# to @next/env (the exact library Next uses) instead of custom grep/sed parsing, which
# cannot handle quoted paths, spaces, variable expansion, or dotenv-style comments.
if [ -z "${MUSIC_NOTEBOOK_DATA_DIR:-}" ]; then
  v="$(node "$SCRIPT_DIR/resolve-env.cjs" MUSIC_NOTEBOOK_DATA_DIR "$PROJECT_DIR" 2>/dev/null)"
  if [ -n "$v" ]; then export MUSIC_NOTEBOOK_DATA_DIR="$v"; echo "Using MUSIC_NOTEBOOK_DATA_DIR from .env files"; fi
fi
DATA_DIR="${MUSIC_NOTEBOOK_DATA_DIR:-$PROJECT_DIR/storage}"
mkdir -p "$DATA_DIR"
LOG_FILE="$DATA_DIR/server.log"

URL="http://127.0.0.1:$PORT"
if curl -s -f "$URL" > /dev/null 2>&1; then
  echo "Server already running on port $PORT."
else
  echo "Notebook data directory: $DATA_DIR"

  # Never migrate silently: check first and ask.
  npx --no-install tsx scripts/db.ts pending
  status=$?
  if [ "$status" -eq 10 ]; then
    if [ "$INTERACTIVE" -ne 1 ]; then
      echo "The database needs a schema migration. Run 'npm run db:migrate' interactively first."
      exit 3
    fi
    printf "The database needs a schema migration. A complete backup is made first.\nType 'migrate' to continue, anything else to cancel: "
    read -r answer
    if [ "$answer" != "migrate" ]; then echo "Cancelled; nothing was changed."; exit 3; fi
    npm run -s db:migrate || { echo "Migration failed; the app was not started. See messages above."; exit 3; }
  elif [ "$status" -ne 0 ]; then
    echo "Could not check the database schema; the app was not started."
    exit 3
  fi

  echo "Starting BxB Music Notebook ($MODE) on port $PORT..."
  PORT="$PORT" nohup npm run "$MODE" > "$LOG_FILE" 2>&1 &
  # Wait for the server to come online (up to 30 seconds)
  for _ in $(seq 1 60); do
    if curl -s -f "$URL" > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

if command -v open > /dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open > /dev/null 2>&1; then
  xdg-open "$URL" > /dev/null 2>&1 || true
fi

# Optional macOS desktop notification
if command -v osascript > /dev/null 2>&1; then
  osascript -e "display notification \"Running at $URL\" with title \"BxB Music Notebook\" subtitle \"Ready\"" > /dev/null 2>&1 || true
fi
echo "BxB Music Notebook: $URL"
