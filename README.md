# gnome-workflows

A GNOME Shell 50 extension that puts a workflow launcher in the top panel.
Click its gear icon or press **Super + Alt + W**, search your workflows, and
click a result or press **Enter** to run it. Use **↑ / ↓** to select a result
and **Esc** to close the dialog.

## Install

Requires GNOME Shell 50, Bash, and the `gnome-extensions` command. No npm
dependencies or build tools are needed to run the extension.

From this project directory:

```bash
bash scripts/install.sh
```

On a first installation, GNOME may require you to log out and back in before
it discovers the extension. The installer enables it for your next session.
If you need to enable it manually later:

```bash
gnome-extensions enable gnome-workflows@artgish
```

If updating an already loaded version, log out and back in to load the new
JavaScript. GNOME 50 uses Wayland, so restarting Shell with Alt+F2 → `r` is
unavailable. See the [GNOME 50 porting guide](https://gjs.guide/extensions/upgrading/gnome-shell-50.html).

To build a distributable ZIP:

```bash
bash scripts/pack.sh
```

The archive is `dist/gnome-workflows@artgish.shell-extension.zip`.

## Define workflows

On first enable, the extension creates
`~/.config/gnome-workflows/workflows.yaml` from
[workflows.example.yaml](workflows.example.yaml), preserving an existing file.
Use **Edit YAML** in the launcher to open it with your default application for
YAML files, or edit it directly in your text editor.

```yaml
workflows:
  - id: project-tests
    name: Run project tests
    description: Check the backend before pushing
    icon: system-run-symbolic
    tags: [dev, backend, test]
    cwd: ~/Projects/my-project
    env:
      NODE_ENV: test
      PORT: "3000"
    commands:
      - npm run lint
      - npm test

  - name: Open project
    tags: [dev, files]
    command: xdg-open "$HOME/Projects/my-project"

  - name: Small script
    cwd: "~"
    command: |
      printf 'Current directory: %s\n' "$PWD"
      uname -a
```

| Field | Meaning |
| --- | --- |
| `name` | Required display name. |
| `id` | Optional unique ID. Defaults to the name; explicit IDs stay stable when names change. |
| `command` | One shell command or a YAML multiline script. |
| `commands` | A non-empty list of shell commands. Use either `command` or `commands`. |
| `description` | Optional description shown below the name. |
| `tags` | Optional list of searchable strings. |
| `icon` | Optional installed icon name, default `system-run-symbolic`. |
| `cwd` | Optional working directory. Defaults to your home directory. `~/` expands to home; relative paths resolve beside the YAML file. Quote a bare `"~"`. |
| `env` | Optional environment variables added to the inherited desktop environment. Values must be strings; quote numbers and booleans. |

The file uses YAML 1.2, including comments, quoted strings, block scalars, and
anchors. YAML interprets bare `~` as null and bare `true` / `false` as booleans;
quote them when they are meant to be commands or strings. Use `workflows: []`
for an empty launcher. Unknown fields, duplicate IDs, invalid types, and syntax
errors appear in the launcher, with no workflows available until corrected.

Changes reload automatically, including saves that replace the file by rename.
Opening the dialog also reloads it. Search is case insensitive: each search word
must occur somewhere in the name, description, tags, or commands.

## Execution and logs

Commands run in the background in `/bin/bash`, with `-e` and `pipefail`.
A `commands` list runs as one script in one shell, so `cd` and `export` persist
between steps. Normal shell error handling applies: a failed command or pipeline
stops the script, except in Bash constructs that explicitly handle failure,
such as `if` and `||`.

Each run writes combined stdout and stderr to a private file in
`~/.local/state/gnome-workflows/logs/` (or the corresponding `XDG_STATE_HOME`).
The **Logs** button opens that directory. Only failed workflows send completion
notifications, including the log path and failure exit code (or signal termination).
Successful workflows finish silently. Log files are retained until you remove
them. Different workflows can run concurrently; the same ID cannot be launched
twice while it is running in the current enabled extension session.

Workflows run as your current user and have no interactive terminal. For a
command that needs a terminal, launch your installed terminal explicitly, for
example `command: kgx -- bash -lc 'htop'` if you use GNOME Console. In that case,
the terminal owns the interactive command and the extension tracks only the
terminal launch process.

Bash does not load interactive shell profiles. Use executable paths, explicit
environment variables, or source a required setup script in the workflow.
Disabling the extension cancels monitoring and removes its UI; commands already
launched continue running. Re-enabling starts a fresh running-workflow list.

## Preferences

Open **Settings** from the launcher, or run:

```bash
gnome-extensions prefs gnome-workflows@artgish
```

Set a custom YAML path or change the shortcut using GTK accelerator notation
(for example `<Super><Alt>w`). An empty path selects the default file; an empty
shortcut disables keyboard activation. Click the entry's apply button after
editing. The extension creates only the default YAML file automatically; create
custom files yourself.

## Development checks

```bash
npm test                 # YAML validation, search, shell sequence behavior
npm run test:gjs         # Real Gio execution and file monitoring
npm run test:shell       # Isolated headless GNOME Shell integration test
```

The first check requires Node.js; runtime tests require GJS. The Shell test also
requires GNOME 50's `gnome-shell-test-tool` and `dbus-run-session`. It installs
the ZIP in temporary XDG directories, exercises the panel and dialog, and checks
search, command execution, live reload, and extension lifecycle. Its launcher
screenshot is saved to `/tmp/gnome-workflows-launcher.png`.

The extension uses [GNOME's ES module extension APIs](https://gjs.guide/extensions/overview/imports-and-modules.html)
and [Gio subprocesses](https://gjs.guide/guides/gio/subprocesses.html).
The bundled YAML parser and its license are documented in [vendor/README.md](vendor/README.md).

## Remove

```bash
gnome-extensions disable gnome-workflows@artgish
gnome-extensions uninstall gnome-workflows@artgish
```

Your YAML configuration and logs remain available after uninstalling.

## License

Licensed under the [MIT License](LICENSE). The bundled js-yaml parser has its
own [MIT license notice](vendor/js-yaml.LICENSE).
