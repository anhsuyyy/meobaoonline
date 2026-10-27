const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/modules/auth/userModel');

test('validates a newly registered account with its not-yet-created NRO character', async () => {
    const user = new User({
        username: 'newplayer',
        passwordHash: 'a'.repeat(128),
        salt: 'b'.repeat(32),
        character: {}
    });

    await assert.doesNotReject(() => user.validate());
    assert.equal(user.character.nroCharacter.created, false);
    assert.equal(user.character.nroCharacter.characterName, '');
});
