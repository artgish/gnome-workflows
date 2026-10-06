import {load, CORE_SCHEMA} from './vendor/js-yaml.mjs';

const ROOT_KEYS = new Set(['workflows']);
const WORKFLOW_KEYS = new Set([
    'id', 'name', 'description', 'icon', 'tags', 'command', 'commands', 'cwd', 'env',
]);
const MAX_CONFIG_LENGTH = 1024 * 1024;

function isMapping(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
    throw new Error(message);
}

function checkKeys(mapping, allowed, label) {
    for (const key of Object.keys(mapping)) {
        if (!allowed.has(key))
            fail(`${label}: unknown field "${key}".`);
    }
}

function nonEmptyString(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0'))
        fail(`${label} must be a non-empty string without NUL characters.`);
    return value;
}

/** Parse and validate the entire file before exposing runnable workflows. */
export function parseWorkflows(source) {
    if (source.length > MAX_CONFIG_LENGTH)
        fail('Workflow YAML must be smaller than 1 MiB.');

    const document = load(source, {schema: CORE_SCHEMA});
    if (!isMapping(document))
        fail('The YAML document must contain a "workflows" list.');
    checkKeys(document, ROOT_KEYS, 'Document');
    if (!Array.isArray(document.workflows))
        fail('"workflows" must be a list. Use "workflows: []" for an empty launcher.');

    const ids = new Set();
    return document.workflows.map((raw, index) => {
        const label = `Workflow ${index + 1}`;
        if (!isMapping(raw))
            fail(`${label} must be a mapping.`);
        checkKeys(raw, WORKFLOW_KEYS, label);
        const name = nonEmptyString(raw.name, `${label} name`);
        const id = nonEmptyString(raw.id ?? name, `${label} id`);
        if (ids.has(id))
            fail(`${label}: duplicate workflow id "${id}".`);
        ids.add(id);

        if (Object.hasOwn(raw, 'command') === Object.hasOwn(raw, 'commands'))
            fail(`${label}: supply exactly one of "command" or "commands".`);
        const commands = Object.hasOwn(raw, 'command') ? [raw.command] : raw.commands;
        if (!Array.isArray(commands) || commands.length === 0)
            fail(`${label} commands must be a non-empty list of strings.`);
        commands.forEach((command, step) =>
            nonEmptyString(command, `${label} command ${step + 1}`));

        const description = raw.description ?? '';
        if (typeof description !== 'string')
            fail(`${label} description must be a string.`);
        const icon = nonEmptyString(raw.icon ?? 'system-run-symbolic', `${label} icon`);
        const tags = raw.tags ?? [];
        if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string'))
            fail(`${label} tags must be a list of strings.`);
        const cwd = raw.cwd === undefined ? null : nonEmptyString(raw.cwd, `${label} cwd`);
        const env = raw.env ?? {};
        if (!isMapping(env))
            fail(`${label} env must be a mapping.`);
        for (const [key, value] of Object.entries(env)) {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
                fail(`${label}: invalid environment variable "${key}".`);
            if (typeof value !== 'string' || value.includes('\0'))
                fail(`${label} env.${key} must be a string. Quote numbers and booleans.`);
        }

        return {id, name, description, icon, tags: [...tags], commands: [...commands],
            cwd, env: {...env}};
    });
}

/** Match every query word across names, descriptions, tags, and commands. */
export function filterWorkflows(workflows, query) {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return workflows.filter(workflow => {
        const text = [workflow.name, workflow.description, ...workflow.tags,
            ...workflow.commands].join(' ').toLocaleLowerCase();
        return terms.every(term => text.includes(term));
    });
}

export function expandHome(path, home) {
    if (path === '~')
        return home;
    if (path.startsWith('~/'))
        return `${home}/${path.slice(2)}`;
    return path;
}

export function workflowArgv(workflow) {
    // Bash is required to execute the shell syntax in user-defined workflows.
    // One shell preserves cd/export between steps. -e and pipefail stop on errors.
    return ['/bin/bash', '-e', '-o', 'pipefail', '-c', workflow.commands.join('\n')];
}
