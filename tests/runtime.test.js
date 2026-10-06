import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import {WorkflowRunner, WorkflowStore} from '../runtime.js';
import {parseWorkflows} from '../workflows.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function delay(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function waitFor(check) {
    for (let count = 0; count < 80; count++) {
        if (check())
            return;
        await delay(50);
    }
    throw new Error('Timed out waiting for file reload');
}

const loop = new GLib.MainLoop(null, false);
let exitCode = 0;

async function runTests() {
    const directory = GLib.dir_make_tmp('gnome-workflows-runtime-XXXXXX');
    const configPath = GLib.build_filenamev([directory, 'workflows.yaml']);
    let store;
    const runner = new WorkflowRunner();
    // Keep all test output in the temporary directory.
    runner.logDirectory = GLib.build_filenamev([directory, 'logs']);
    try {
        GLib.file_set_contents(configPath, `workflows:
  - name: Runtime
    cwd: .
    env: {GREETING: "hello world"}
    command: printf '%s|%s' "$GREETING" "$PWD"
`);
        store = new WorkflowStore(configPath, () => {});
        await waitFor(() => store.workflows.length === 1);
        const result = await runner.run(store.workflows[0], configPath);
        const [, bytes] = GLib.file_get_contents(result.logPath);
        assert(result.success, 'Command failed');
        assert(new TextDecoder().decode(bytes) === `hello world|${directory}`, 'cwd/environment mismatch');
        const info = Gio.File.new_for_path(result.logPath).query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
        assert((info.get_attribute_uint32('unix::mode') & 0o777) === 0o600, 'Logs should be private');

        const failed = parseWorkflows('workflows:\n  - name: Fail\n    commands: [echo first, exit 7, echo unreachable]')[0];
        const failure = await runner.run(failed, configPath);
        assert(!failure.success && failure.status === 7, 'Exit status not captured');
        const [, output] = GLib.file_get_contents(failure.logPath);
        assert(new TextDecoder().decode(output) === 'first\n', 'Sequence did not stop on failure');

        const long = parseWorkflows('workflows:\n  - name: Long\n    command: sleep 0.2')[0];
        const running = runner.run(long, configPath);
        let duplicateRejected = false;
        try {
            await runner.run(long, configPath);
        } catch (error) {
            duplicateRejected = error.message.includes('already running');
        }
        assert(duplicateRejected, 'Duplicate workflow started');
        await running;

        const file = Gio.File.new_for_path(configPath);
        file.replace_contents(new TextEncoder().encode('workflows:\n  - name: Reloaded\n    command: "true"'),
            null, false, Gio.FileCreateFlags.NONE, null);
        await waitFor(() => store.workflows[0]?.name === 'Reloaded');
        file.replace_contents(new TextEncoder().encode('workflows: invalid'),
            null, false, Gio.FileCreateFlags.NONE, null);
        await waitFor(() => store.error !== null);
        assert(store.workflows.length === 0, 'Invalid config retained runnable workflows');
        file.replace_contents(new TextEncoder().encode('workflows: []'),
            null, false, Gio.FileCreateFlags.NONE, null);
        await waitFor(() => store.error === null);
        assert(store.workflows.length === 0, 'Empty config failed');
        print('PASS: GJS execution, cwd, env, permissions, failure, duplicate prevention, atomic-save reload, recovery');
    } finally {
        store?.dispose();
        runner.dispose();
        // All test files are confined to this freshly-created temporary directory.
        GLib.spawn_sync(null, ['/bin/rm', '-rf', '--', directory], null,
            GLib.SpawnFlags.DEFAULT, null);
    }
}

runTests().catch(error => {
    console.error(`${error.message}\n${error.stack}`);
    exitCode = 1;
}).finally(() => loop.quit());
loop.run();
System.exit(exitCode);
