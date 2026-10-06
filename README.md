# gnome-workflows

A GNOME Shell 50 extension that puts a workflow launcher in the top panel.
Click its gear icon or press **Super + Alt + W**, search your workflows, and
click a result or press **Enter** to run it. Use **↑ / ↓** to select a result
and **Esc** to close the dialog.

## Install

Requires GNOME Shell 50, Bash, and the `gnome-extensions` command. No npm
dependencies or build tools are needed to run the extension.

Installing from this project directory also requires Node.js to generate the
extension's version metadata:

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
Packing uses a temporary directory and leaves the source metadata unchanged.

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

## Publish on GNOME Extensions

Before submitting, read the [review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
and [GNOME Code of Conduct](https://conduct.gnome.org/), then run:

```bash
npm test
npm run test:gjs
npm run test:shell
npm run test:review
```

The Shell test rebuilds the ZIP. To build it independently, run `npm run pack`.
If you need to set up the analyzer:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-review.txt
```

Tree-sitter is pinned because Shexli 0.2.1 crashed with Tree-sitter 0.26.0
in this project's Python 3.14 environment. Review the analyzer's reported
findings; its exit code alone does not indicate a clean result.

Sign in at [extensions.gnome.org/upload](https://extensions.gnome.org/upload/)
and submit `dist/gnome-workflows@artgish.shell-extension.zip`. GNOME assigns the
numeric submission version during upload. The ZIP's `version-name` is generated
from the package version or validated release tag. A clean local scan does not
replace review.

For the reviewer: Bash is required to run the user's shell commands. Workflows
run only when selected by the user; enabling the extension never runs them.
Disabling removes the UI and file monitoring and cancels pending callbacks;
commands already launched continue independently. The ZIP includes the readable
js-yaml parser, its upstream reference, and both license notices.

## CI and releases

GitHub Actions runs the checks on branch pushes, pull requests, and manual CI
runs. Fedora 44 supplies GNOME Shell 50 for the headless launcher and preferences
tests. CI also checks shell scripts and the settings schema, runs Node and GJS
tests, builds the ZIP, and fails on any Shexli finding. Successful runs provide a
`gnome-workflows` artifact with the ZIP, SHA-256 checksums, and review report.
Test logs and the launcher screenshot are available in `test-diagnostics`.

To publish a GitHub release, set the version in `package.json`, commit and push
the desired code, then push a matching tag. For the current version:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow requires the tag to match `v` plus the package version,
passes that tag to the packager, reruns CI on the tagged commit, verifies the
resulting checksums, and publishes
the tested bundle with generated release notes. Versions with a prerelease
suffix, such as `0.2.0-rc.1`, create prereleases. It uses GitHub's built-in token and
requires no additional secrets. GNOME Extensions submission remains a separate
upload of the release ZIP, followed by GNOME's review.

The version shown in GNOME comes from the ZIP's `version-name`: tag `v0.1.0`
produces `0.1.0`, and `v0.2.0-rc.1` produces `0.2.0 rc.1`. GNOME only allows
letters, numbers, spaces, and periods in this field, so hyphens and plus signs
become spaces. Versions exceeding its 16-character limit fail validation.
The numeric `version` remains controlled by extensions.gnome.org.
See [GNOME's metadata rules](https://gjs.guide/extensions/overview/anatomy.html#version-name).
Local and branch builds use `package.json`; to check a release build locally:

```bash
RELEASE_TAG=v0.1.0 npm run pack
```

## Remove

```bash
gnome-extensions disable gnome-workflows@artgish
gnome-extensions uninstall gnome-workflows@artgish
```

Your YAML configuration and logs remain available after uninstalling.

## License

Licensed under the [MIT License](LICENSE). The bundled js-yaml parser has its
own [MIT license notice](vendor/js-yaml.LICENSE).
