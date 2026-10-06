import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {expandHome, parseWorkflows, workflowArgv} from './workflows.js';

export function defaultConfigPath() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-workflows', 'workflows.yaml']);
}

export function resolveConfigPath(setting) {
    return setting.trim()
        ? GLib.canonicalize_filename(expandHome(setting.trim(), GLib.get_home_dir()), GLib.get_home_dir())
        : defaultConfigPath();
}

export async function ensureDefaultConfig(extensionDirectory, cancellable = null) {
    const file = Gio.File.new_for_path(defaultConfigPath());
    if (file.query_exists(null))
        return;
    GLib.mkdir_with_parents(file.get_parent().get_path(), 0o700);
    const source = extensionDirectory.get_child('workflows.example.yaml');
    const [, contents] = await new Promise((resolve, reject) => {
        source.load_contents_async(cancellable, (file, result) => {
            try {
                resolve(file.load_contents_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
    if (cancellable?.is_cancelled())
        return;
    try {
        const stream = file.create(Gio.FileCreateFlags.PRIVATE, null);
        try {
            stream.write_all(contents, null);
        } finally {
            stream.close(null);
        }
    } catch (error) {
        if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw error;
    }
}

/** Watch the directory so editors that save by rename also trigger a reload. */
export class WorkflowStore {
    constructor(path, onChange) {
        this.path = path;
        this.workflows = [];
        this.error = null;
        this._onChange = onChange;
        this._file = Gio.File.new_for_path(path);
        this._generation = 0;
        this._disposed = false;
        this._reloadSource = 0;
        this._monitor = null;
        this._monitorChangedId = 0;
        this._cancellable = new Gio.Cancellable();
        this._watch();
        this.reload();
    }

    _watch() {
        try {
            const parent = this._file.get_parent();
            this._monitor = parent.query_exists(null)
                ? parent.monitor_directory(Gio.FileMonitorFlags.NONE, null)
                : this._file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitorChangedId = this._monitor.connect('changed', (_monitor, file, otherFile) => {
                if (!file.equal(this._file) && !otherFile?.equal(this._file))
                    return;
                if (this._reloadSource)
                    GLib.Source.remove(this._reloadSource);
                this._reloadSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    this._reloadSource = 0;
                    this.reload();
                    return GLib.SOURCE_REMOVE;
                });
            });
        } catch (error) {
            // Opening the launcher always reloads, even without a working monitor.
            console.warn(`gnome-workflows: unable to watch ${this.path}: ${error.message}`);
        }
    }

    reload() {
        const generation = ++this._generation;
        this._file.load_contents_async(this._cancellable, (file, result) => {
            if (this._disposed || generation !== this._generation)
                return;
            try {
                const [, bytes] = file.load_contents_finish(result);
                this.workflows = parseWorkflows(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
                this.error = null;
            } catch (error) {
                this.workflows = [];
                this.error = error.message;
            }
            this._onChange();
        });
    }

    dispose() {
        this._disposed = true;
        this._cancellable.cancel();
        if (this._monitorChangedId)
            this._monitor.disconnect(this._monitorChangedId);
        this._monitorChangedId = 0;
        this._monitor?.cancel();
        this._monitor = null;
        if (this._reloadSource)
            GLib.Source.remove(this._reloadSource);
        this._reloadSource = 0;
        this._onChange = null;
    }
}

/** Background processes write to files, keeping command output out of Shell memory. */
export class WorkflowRunner {
    constructor(onChange = () => {}) {
        this.running = new Map();
        this._onChange = onChange;
        this._cancellable = new Gio.Cancellable();
        this._disposed = false;
        this.logDirectory = GLib.build_filenamev([
            GLib.get_user_state_dir(), 'gnome-workflows', 'logs',
        ]);
    }

    async run(workflow, configPath) {
        if (this._disposed)
            throw new Error('Workflow runner has been disabled.');
        if (this.running.has(workflow.id))
            throw new Error(`${workflow.name} is already running.`);

        const directory = workflow.cwd === null
            ? GLib.get_home_dir()
            : GLib.canonicalize_filename(expandHome(workflow.cwd, GLib.get_home_dir()),
                GLib.path_get_dirname(configPath));
        if (!GLib.file_test(directory, GLib.FileTest.IS_DIR))
            throw new Error(`Working directory does not exist: ${directory}`);
        if (GLib.mkdir_with_parents(this.logDirectory, 0o700) !== 0)
            throw new Error(`Cannot create log directory: ${this.logDirectory}`);

        const slug = workflow.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'workflow';
        const logPath = GLib.build_filenamev([
            this.logDirectory, `${slug}-${GLib.uuid_string_random()}.log`,
        ]);
        const stream = Gio.File.new_for_path(logPath).create(Gio.FileCreateFlags.PRIVATE, null);
        stream.close(null);

        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDERR_MERGE});
        launcher.set_cwd(directory);
        launcher.set_stdout_file_path(logPath);
        for (const [key, value] of Object.entries(workflow.env))
            launcher.setenv(key, value, true);

        let process;
        try {
            process = launcher.spawnv(workflowArgv(workflow));
        } finally {
            launcher.close();
        }
        this.running.set(workflow.id, {process, logPath});
        this._onChange();
        try {
            await new Promise((resolve, reject) => {
                process.wait_async(this._cancellable, (proc, result) => {
                    try {
                        proc.wait_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            return {
                success: process.get_successful(),
                status: process.get_if_exited() ? process.get_exit_status() : null,
                logPath,
            };
        } finally {
            this.running.delete(workflow.id);
            if (!this._disposed)
                this._onChange();
        }
    }

    dispose() {
        // Cancel observation only; user-launched commands continue independently.
        this._disposed = true;
        this._cancellable.cancel();
        this.running.clear();
        this._onChange = null;
    }
}
