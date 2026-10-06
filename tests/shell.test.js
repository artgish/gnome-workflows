import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

async function waitFor(check, message) {
    for (let count = 0; count < 100; count++) {
        if (check())
            return;
        await Scripting.sleep(50);
    }
    throw new Error(message);
}

export async function run() {
    await waitFor(() => Extension.lookupByUUID('gnome-workflows@artgish')?.store?.workflows.length === 3,
        'Extension did not enable or sample YAML did not load');
    const extension = Extension.lookupByUUID('gnome-workflows@artgish');
    assert(Main.panel.statusArea[extension.uuid] === extension._indicator, 'Panel indicator missing');
    await Scripting.sleep(500);
    const seat = global.stage.context.get_backend().get_default_seat();
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    await Scripting.sleep(100);
    const [x, y] = extension._indicator.get_transformed_position();
    print(`Panel geometry: ${x},${y} ${extension._indicator.width}×${extension._indicator.height}`);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(),
        x + extension._indicator.width / 2, y + extension._indicator.height / 2);
    await Scripting.sleep(100);
    print(`Pointer: ${global.get_pointer()} picked: ${global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x + extension._indicator.width / 2, y + extension._indicator.height / 2)}`);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(50);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await waitFor(() => extension._dialog?.visible, 'Panel click did not open launcher');
    await Scripting.sleep(300);
    const dialog = extension._dialog;
    assert(dialog.visible, 'Launcher did not open');
    assert(dialog._rows.length === 3, 'Workflows missing from dialog');
    assert(global.stage.get_key_focus() === dialog._search.clutter_text, 'Search was not focused');
    dialog._search.set_text('hello');
    assert(dialog._rows.length === 1, 'Search did not filter workflows');
    assert(dialog._rows[0].workflow.id === 'hello', 'Wrong workflow matched');
    dialog._search.set_text('does-not-exist');
    assert(dialog._rows.length === 0, 'No-match search failed');
    dialog._search.set_text('');
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Down, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Down, Clutter.KeyState.RELEASED);
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Down, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Down, Clutter.KeyState.RELEASED);
    await Scripting.sleep(100);
    assert(dialog._selected === 2, 'Keyboard selection failed');

    // Capture the launcher in the isolated compositor for visual inspection.
    await Scripting.sleep(200);
    const screenshot = new Shell.Screenshot();
    const image = Gio.File.new_for_path('/tmp/gnome-workflows-launcher.png');
    const stream = image.replace(null, false, Gio.FileCreateFlags.NONE, null);
    try {
        await screenshot.screenshot(false, stream);
    } finally {
        stream.close(null);
    }
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Return, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Return, Clutter.KeyState.RELEASED);
    await Scripting.sleep(100);
    await waitFor(() => extension.runner.running.size === 0, 'Workflow did not finish');
    assert(!dialog.visible, 'Dialog remained open after launching');

    // Check settings changes, config errors, and reopening the same dialog.
    const config = Gio.File.new_for_path(extension.store.path);
    config.replace_contents(new TextEncoder().encode('workflows: invalid'),
        null, false, Gio.FileCreateFlags.NONE, null);
    await waitFor(() => extension.store.error !== null, 'Live reload did not report invalid YAML');
    extension.openLauncher();
    await Scripting.sleep(100);
    assert(dialog._status.text.includes('Cannot load workflows'), 'Config error is not visible');
    assert(dialog._rows.length === 0, 'Invalid YAML left runnable rows');

    config.replace_contents(new TextEncoder().encode('workflows: []'),
        null, false, Gio.FileCreateFlags.NONE, null);
    await waitFor(() => extension.store.error === null, 'Config did not recover');
    assert(dialog._rows.length === 0, 'Empty list is not reflected');
    dialog.close();

    await Main.extensionManager.disableExtension(extension.uuid);
    assert(!Main.panel.statusArea[extension.uuid], 'Indicator leaked after disable');
    assert(extension.runner === null && extension.store === null, 'Runtime leaked after disable');
    await Main.extensionManager.enableExtension(extension.uuid);
    await waitFor(() => extension.store !== null, 'Extension did not re-enable');
    extension.openLauncher();
    await Scripting.sleep(100);
    assert(extension._dialog.visible, 'Launcher did not reopen after re-enable');
    extension._dialog.close();

    // Preferences execute in GTK outside Shell, connected to this test compositor.
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
    launcher.setenv('WAYLAND_DISPLAY', 'gnome-shell-test-display', true);
    launcher.setenv('GI_TYPELIB_PATH', '/usr/lib/gnome-shell/girepository-1.0', true);
    launcher.setenv('LD_LIBRARY_PATH', '/usr/lib/gnome-shell', true);
    const script = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('prefs.test.js').get_path();
    const process = launcher.spawnv(['gjs', '-m', script, extension.path]);
    launcher.close();
    const [stdout, stderr] = await new Promise((resolve, reject) => {
        process.communicate_utf8_async(null, null, (proc, result) => {
            try {
                const [, out, err] = proc.communicate_utf8_finish(result);
                resolve([out, err]);
            } catch (error) {
                reject(error);
            }
        });
    });
    assert(process.get_successful(), `Preferences failed: ${stderr}`);
    print(stdout.trim());
    print('PASS: GNOME Shell 50 panel, dialog, search, selection, command launch, live reload, lifecycle');
}
