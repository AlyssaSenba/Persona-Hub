#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies for the first time..."
  npm install
fi

echo "Building web UI..."
npm run build

echo "Starting Persona Lab (web)... Press Ctrl+C to stop."
npm start
