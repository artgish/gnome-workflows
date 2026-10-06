#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
bash "$project_dir/scripts/pack.sh"
gnome-extensions install --force "$project_dir/dist/gnome-workflows@artgish.shell-extension.zip"
if gnome-extensions enable gnome-workflows@artgish; then
    printf 'Installed and enabled gnome-workflows. Open it from the panel or press Super+Alt+W.\n'
else
    # A new extension is not in the running Shell's inventory yet. Persist its
    # enabled state so the next login discovers and enables it automatically.
    gjs -c '
        const settings = new imports.gi.Gio.Settings({schema_id: "org.gnome.shell"});
        const uuid = "gnome-workflows@artgish";
        const enabled = settings.get_strv("enabled-extensions");
        if (!enabled.includes(uuid))
            settings.set_strv("enabled-extensions", [...enabled, uuid]);
        imports.gi.Gio.Settings.sync();
    '
    printf 'Installed gnome-workflows and enabled it for your next session. Log out and back in to show the panel icon.\n'
fi
