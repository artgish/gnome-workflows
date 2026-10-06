#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
staging_dir=$(mktemp -d)
trap 'rm -rf -- "$staging_dir"' EXIT

# Generate release metadata in a staging directory so packing does not edit source.
node "$project_dir/scripts/version-metadata.mjs" "$staging_dir/metadata.json"
for source in extension.js prefs.js stylesheet.css LICENSE workflows.js runtime.js launcher.js workflows.example.yaml; do
    cp -- "$project_dir/$source" "$staging_dir/"
done
cp -R -- "$project_dir/vendor" "$staging_dir/vendor"
mkdir -p "$staging_dir/schemas"
cp -- "$project_dir/schemas/"*.gschema.xml "$staging_dir/schemas/"
mkdir -p "$project_dir/dist"
gnome-extensions pack "$staging_dir" --force --out-dir="$project_dir/dist" \
    --extra-source=LICENSE \
    --extra-source=workflows.js \
    --extra-source=runtime.js \
    --extra-source=launcher.js \
    --extra-source=workflows.example.yaml \
    --extra-source=vendor
printf 'Built %s\n' "$project_dir/dist/gnome-workflows@artgish.shell-extension.zip"
