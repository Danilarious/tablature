#!/usr/bin/env bash

export PATH="/Users/bobrannen/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

PROJECT_DIR="/Users/bobrannen/bxb_development/BxB_music-and-recording/bxb_music-notation-and-tablature"
LOG_FILE="$PROJECT_DIR/storage/server.log"

cd "$PROJECT_DIR" || exit 1

# Check if server is already responding on port 3000
if curl -s -f http://127.0.0.1:3000 > /dev/null 2>&1; then
  echo "Server already running on port 3000."
else
  echo "Starting BxB Music Notebook server on 0.0.0.0:3000..."
  nohup npm run dev > "$LOG_FILE" 2>&1 &
  
  # Wait for server to come online (up to 15 seconds)
  for i in $(seq 1 30); do
    if curl -s -f http://127.0.0.1:3000 > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

# Open browser to application
open "http://localhost:3000"

# Optional macOS desktop notification
osascript -e 'display notification "Running at http://localhost:3000 (iPad: http://100.85.151.96:3000)" with title "BxB Music Notebook" subtitle "Ready"' >/dev/null 2>&1 || true
