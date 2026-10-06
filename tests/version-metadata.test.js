import assert from 'node:assert/strict';
import test from 'node:test';

import {versionName} from '../scripts/version-metadata.mjs';

test('stable release version matches its tag and local builds use the package version', () => {
    assert.equal(versionName('0.1.0', 'v0.1.0'), '0.1.0');
    assert.equal(versionName('0.1.0'), '0.1.0');
    assert.throws(() => versionName('0.1.0', 'v0.2.0'), /Release tag must be v0.1.0/);
    assert.throws(() => versionName('0.1.0', '0.1.0'), /Release tag must be v0.1.0/);
});

test('prerelease and build separators are converted to GNOME-compatible spaces', () => {
    assert.equal(versionName('0.2.0-rc.1', 'v0.2.0-rc.1'), '0.2.0 rc.1');
    assert.equal(versionName('1.2.3+build.7'), '1.2.3 build.7');
    assert.equal(versionName('1.2.3-beta-1'), '1.2.3 beta 1');
});

test('invalid semantic versions fail before packaging', () => {
    for (const version of ['', null, '1.2', 'v1.2.3', '01.2.3', '1.2.3-01', '1.2.3-rc..1', '1.2.3/a'])
        assert.throws(() => versionName(version), /Invalid package version/);
});

test('the GNOME display limit is enforced without truncating versions', () => {
    assert.equal(versionName('1.2.3+abcdefghij'), '1.2.3 abcdefghij');
    assert.equal(versionName('1.2.3+abcdefghij').length, 16);
    assert.throws(() => versionName('1.2.3+abcdefghijk'), /16-character limit/);
});
