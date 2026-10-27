import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthenticatedCharacter } from '../src/features/auth/authSession.js';

test('registration uses the character returned with the created account without a second request', async () => {
    const character = { level: 1, nroCharacter: { created: false } };
    let fetchCount = 0;
    const resolved = await resolveAuthenticatedCharacter({
        isRegister: true,
        result: { token: 'session-token', user: { character } },
        fetchCharacter: async () => { fetchCount += 1; throw new Error('must not make another request'); }
    });

    assert.equal(resolved, character);
    assert.equal(fetchCount, 0);
});

test('login still loads the existing character with its session token', async () => {
    const character = { level: 12, nroCharacter: { created: true } };
    const resolved = await resolveAuthenticatedCharacter({
        isRegister: false,
        result: { token: 'session-token', user: { character: { level: 1 } } },
        fetchCharacter: async (token) => {
            assert.equal(token, 'session-token');
            return { character };
        }
    });

    assert.equal(resolved, character);
});
