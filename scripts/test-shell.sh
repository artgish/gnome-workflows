#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
bash "$project_dir/scripts/pack.sh"
# The GNOME test tool installs into temporary XDG directories. It does not alter
# the real desktop's extensions or workflow configuration.
dbus-run-session -- gnome-shell-test-tool --headless --disable-animations \
    --extension "$project_dir/dist/gnome-workflows@artgish.shell-extension.zip" \
    "$project_dir/tests/shell.test.js"
