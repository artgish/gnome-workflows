import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {defaultConfigPath} from './runtime.js';

export default class GnomeWorkflowsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'gnome-workflows', icon_name: 'system-run-symbolic'});
        window.add(page);
        const group = new Adw.PreferencesGroup({
            title: 'Launcher',
            description: 'Workflows reload automatically when their YAML file changes.',
        });
        page.add(group);

        const path = new Adw.EntryRow({title: 'Workflow YAML path', show_apply_button: true});
        path.text = settings.get_string('config-path');
        path.connect('apply', () => settings.set_string('config-path', path.text.trim()));
        group.add(path);
        group.add(new Adw.ActionRow({title: 'Default file', subtitle: defaultConfigPath()}));

        const shortcut = new Adw.EntryRow({title: 'Keyboard shortcut', show_apply_button: true});
        shortcut.text = settings.get_strv('open-launcher')[0] ?? '';
        shortcut.connect('apply', () => {
            const value = shortcut.text.trim();
            const [ok, key, modifiers] = Gtk.accelerator_parse(value);
            if (value && (!ok || !Gtk.accelerator_valid(key, modifiers))) {
                shortcut.add_css_class('error');
                window.add_toast(new Adw.Toast({title: 'Enter a valid shortcut, e.g. <Super><Alt>w'}));
                return;
            }
            shortcut.remove_css_class('error');
            settings.set_strv('open-launcher', value ? [value] : []);
        });
        group.add(shortcut);
        group.add(new Adw.ActionRow({
            title: 'Shortcut format',
            subtitle: 'Default: <Super><Alt>w. Leave blank to disable the shortcut.',
        }));
        // Keep settings alive for the lifetime of this preferences window.
        window._workflowSettings = settings;
    }
}
