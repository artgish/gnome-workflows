#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
shexli_bin=${SHEXLI:-"$project_dir/.venv/bin/shexli"}
report="$project_dir/dist/shexli-report.json"
"$shexli_bin" --format json "$project_dir/dist/gnome-workflows@artgish.shell-extension.zip" > "$report"

# Shexli exits successfully even when its report contains findings.
node --input-type=module - "$report" <<'JS'
import {readFileSync} from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (report.summary?.status !== 'clean' || report.summary.finding_count !== 0 ||
    !Array.isArray(report.findings) || report.findings.length !== 0) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
}
console.log('PASS: Shexli reports no errors or warnings.');
JS
