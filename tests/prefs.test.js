import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const directory = Gio.File.new_for_path(ARGV[0]);
const [, bytes] = directory.get_child('metadata.json').load_contents(null);
const metadata = JSON.parse(new TextDecoder().decode(bytes));
metadata.dir = directory;
metadata.path = ARGV[0];
const {default: Preferences} = await import(directory.get_child('prefs.js').get_uri());

Gtk.init();
Adw.init();
const preferences = new Preferences(metadata);
const window = new Adw.PreferencesWindow();
preferences.fillPreferencesWindow(window);

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function findRows(widget, rows = []) {
    if (widget instanceof Adw.EntryRow)
        rows.push(widget);
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        findRows(child, rows);
    return rows;
}

const rows = findRows(window);
const path = rows.find(row => row.title === 'Workflow YAML path');
const shortcut = rows.find(row => row.title === 'Keyboard shortcut');
const settings = window._workflowSettings;
assert(path && shortcut, 'Preferences entries missing');
path.text = '/tmp/custom-workflows.yaml';
path.emit('apply');
assert(settings.get_string('config-path') === path.text, 'Config preference did not persist');
path.text = '';
path.emit('apply');
shortcut.text = '<Super><Alt>k';
shortcut.emit('apply');
assert(settings.get_strv('open-launcher')[0] === shortcut.text, 'Shortcut did not persist');
shortcut.text = 'invalid shortcut';
shortcut.emit('apply');
assert(shortcut.has_css_class('error'), 'Invalid shortcut was accepted');
assert(settings.get_strv('open-launcher')[0] === '<Super><Alt>k', 'Invalid shortcut changed settings');
shortcut.text = '';
shortcut.emit('apply');
assert(settings.get_strv('open-launcher').length === 0, 'Empty shortcut did not disable binding');
shortcut.text = '<Super><Alt>w';
shortcut.emit('apply');
window.destroy();
Gio.Settings.sync();
print('PASS: GTK preferences, YAML path, shortcut validation and persistence');
