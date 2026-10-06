#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$project_dir/dist"
gnome-extensions pack "$project_dir" --force --out-dir="$project_dir/dist" \
    --extra-source=LICENSE \
    --extra-source=workflows.js \
    --extra-source=runtime.js \
    --extra-source=launcher.js \
    --extra-source=workflows.example.yaml \
    --extra-source=vendor
printf 'Built %s\n' "$project_dir/dist/gnome-workflows@artgish.shell-extension.zip"
