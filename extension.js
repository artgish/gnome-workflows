import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {WorkflowDialog} from './launcher.js';
import {ensureDefaultConfig, resolveConfigPath, WorkflowRunner, WorkflowStore} from './runtime.js';

export default class GnomeWorkflowsExtension extends Extension {
    enable() {
        this._cancellable = new Gio.Cancellable();
        this._settings = this.getSettings();
        this.runner = new WorkflowRunner(() => this._dialog?.refresh());
        this._setStore();
        this._settingsChangedId = this._settings.connect('changed::config-path', () => this._setStore());

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, true);
        this._indicator.accessible_name = 'gnome-workflows';
        this._indicator.add_child(new St.Icon({
            icon_name: 'system-run-symbolic', style_class: 'system-status-icon',
        }));
        const click = new Clutter.ClickGesture();
        // The indicator owns the gesture and disconnects its signal on destruction.
        click.connectObject('recognize', () => this.openLauncher(), this._indicator);
        this._indicator.add_action(click);
        this._indicatorKeyPressId = this._indicator.connect('key-press-event', (_actor, event) => {
            if ([Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_space].includes(event.get_key_symbol())) {
                this.openLauncher();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        Main.wm.addKeybinding('open-launcher', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this.openLauncher());
    }

    _setStore() {
        this.store?.dispose();
        const setting = this._settings.get_string('config-path');
        if (!setting.trim()) {
            const cancellable = this._cancellable;
            ensureDefaultConfig(this.dir, cancellable).catch(error => {
                if (!cancellable.is_cancelled())
                    console.error(`gnome-workflows: ${error.message}`);
            });
        }
        this.store = new WorkflowStore(resolveConfigPath(setting), () => this._dialog?.refresh());
        this._dialog?.refresh();
    }

    openLauncher() {
        this.store.reload();
        this._dialog ??= new WorkflowDialog(this);
        this._dialog.present();
    }

    editConfig() {
        this._openUri(Gio.File.new_for_path(this.store.path).get_uri());
    }

    openLogs() {
        GLib.mkdir_with_parents(this.runner.logDirectory, 0o700);
        this._openUri(Gio.File.new_for_path(this.runner.logDirectory).get_uri());
    }

    _openUri(uri) {
        const cancellable = this._cancellable;
        Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1),
            cancellable, (_source, result) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(result);
                } catch (error) {
                    if (this._cancellable === cancellable && !cancellable.is_cancelled())
                        Main.notifyError('gnome-workflows', error.message);
                }
            });
    }

    async runWorkflow(workflow) {
        const runner = this.runner;
        try {
            const completion = await runner.run(workflow, this.store.path);
            if (this.runner !== runner)
                return;
            if (!completion.success)
                Main.notifyError('gnome-workflows',
                    `${workflow.name} failed (${completion.status === null ? 'terminated by signal' : `exit ${completion.status}`}).\nLog: ${completion.logPath}`);
        } catch (error) {
            if (this.runner === runner)
                Main.notifyError('gnome-workflows', error.message);
        }
    }

    disable() {
        this._cancellable?.cancel();
        this._cancellable = null;
        Main.wm.removeKeybinding('open-launcher');
        if (this._settingsChangedId)
            this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = 0;
        this._dialog?.destroy();
        this._dialog = null;
        if (this._indicatorKeyPressId)
            this._indicator.disconnect(this._indicatorKeyPressId);
        this._indicatorKeyPressId = 0;
        this._indicator?.destroy();
        this._indicator = null;
        this.store?.dispose();
        this.store = null;
        this.runner?.dispose();
        this.runner = null;
        this._settings = null;
    }
}
