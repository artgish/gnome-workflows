import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {expandHome, filterWorkflows, parseWorkflows, workflowArgv} from '../workflows.js';

const parse = fields => parseWorkflows(`workflows:\n  - name: Test\n${fields}`)[0];

test('bundled examples parse with block scalars, lists, and environment', () => {
    const workflows = parseWorkflows(readFileSync(new URL('../workflows.example.yaml', import.meta.url), 'utf8'));
    assert.equal(workflows.length, 3);
    assert.deepEqual(workflows[1].commands, ['uname -a', 'df -h']);
    assert.equal(workflows[2].env.GREETING, 'Hello from gnome-workflows');
    assert.match(workflows[2].commands[0], /printf/);
});

test('quoted values, comments, anchors, and folded commands work as YAML', () => {
    const workflows = parseWorkflows(`
workflows:
  - name: 'A: # name'
    tags: &tags [dev, 'two words']
    command: >-
      printf '%s'
      "hello"
  - name: B
    tags: *tags
    command: echo yes # comment
`);
    assert.equal(workflows[0].name, 'A: # name');
    assert.equal(workflows[0].commands[0], `printf '%s' "hello"`);
    assert.deepEqual(workflows[1].tags, ['dev', 'two words']);
});

test('defaults and explicitly empty lists', () => {
    assert.deepEqual(parseWorkflows('workflows: []'), []);
    assert.deepEqual(parse('    command: echo hi'), {
        id: 'Test', name: 'Test', description: '', icon: 'system-run-symbolic',
        tags: [], commands: ['echo hi'], cwd: null, env: {},
    });
});

test('search is case insensitive and matches every word across fields', () => {
    const workflows = parseWorkflows(`workflows:
  - name: Build project
    description: Compile sources
    tags: [dev]
    command: npm run build
  - name: Files
    command: xdg-open .
`);
    assert.equal(filterWorkflows(workflows, ' BUILD dev npm ').length, 1);
    assert.equal(filterWorkflows(workflows, 'sources').length, 1);
    assert.equal(filterWorkflows(workflows, 'build missing').length, 0);
    assert.equal(filterWorkflows(workflows, '  ').length, 2);
});

test('invalid definitions never become runnable', () => {
    const invalid = [
        '', 'workflows: nope', 'workflows: [nope]', 'workflows: null',
        'workflows: []\nunknown: true',
        'workflows:\n  - name: X\n    command: hi\n    command: bye',
        'workflows:\n  - name: X\n    command: hi\n  - name: X\n    command: bye',
    ];
    invalid.forEach(source => assert.throws(() => parseWorkflows(source)));
    const invalidFields = [
        '    command: 42', '    commands: []', '    commands: echo hi',
        '    commands: [echo hi, false]', '    command: ""',
        '    command: echo hi\n    commands: [echo bye]',
        '    command: hi\n    tags: nope', '    command: hi\n    description: 42',
        '    command: hi\n    cwd: false', '    command: hi\n    commmand: typo',
        '    command: hi\n    env: {BAD-NAME: value}',
        '    command: hi\n    env: {PORT: 3000}',
        '    command: hi\n    env: [bad]',
    ];
    invalidFields.forEach(fields => assert.throws(() => parse(fields), fields));
    assert.throws(() => parseWorkflows('x'.repeat(1024 * 1024 + 1)), /1 MiB/);
});

test('home expansion only changes leading ~/ or ~', () => {
    assert.equal(expandHome('~', '/home/test'), '/home/test');
    assert.equal(expandHome('~/a b', '/home/test'), '/home/test/a b');
    assert.equal(expandHome('/tmp/~', '/home/test'), '/tmp/~');
});

test('shell sequences share variables and stop after a failed command', () => {
    const good = parse('    commands: ["value=hello", \'printf "%s" "$value"\']');
    const [program, ...argv] = workflowArgv(good);
    const success = spawnSync(program, argv, {encoding: 'utf8'});
    assert.equal(success.status, 0);
    assert.equal(success.stdout, 'hello');
    const failed = spawnSync(...(() => {
        const [shell, ...args] = workflowArgv(parse('    commands: [false | true, echo should-not-run]'));
        return [shell, args, {encoding: 'utf8'}];
    })());
    assert.notEqual(failed.status, 0);
    assert.equal(failed.stdout, '');
});
