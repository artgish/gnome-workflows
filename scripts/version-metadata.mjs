import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function versionName(version, tag = '') {
    const parsed = typeof version === 'string' && version.match(
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
    if (!parsed || parsed[4]?.split('.').some(identifier => /^0\d+$/.test(identifier)))
        throw new Error(`Invalid package version: ${version}`);
    if (tag && tag !== `v${version}`)
        throw new Error(`Release tag must be v${version}, got ${tag}`);

    // GNOME permits letters, digits, spaces, and periods in version-name.
    const name = version.replace(/[-+]/g, ' ');
    if (name.length > 16)
        throw new Error(`Extension version-name "${name}" exceeds GNOME's 16-character limit.`);
    return name;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        const name = versionName(version, process.env.RELEASE_TAG);
        if (process.argv[2]) {
            const metadata = JSON.parse(readFileSync(new URL('../metadata.json', import.meta.url), 'utf8'));
            metadata['version-name'] = name;
            writeFileSync(process.argv[2], `${JSON.stringify(metadata, null, 2)}\n`);
        }
        console.log(`Extension version-name: ${name}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
