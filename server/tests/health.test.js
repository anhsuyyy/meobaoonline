const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

test('health endpoint identifies the configured game mode', async (t) => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));

    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    const health = await response.json();

    assert.equal(response.status, 200);
    assert.equal(health.status, 'ok');
    assert.equal(health.mode, 'nro');
    assert.equal(health.game, 'Ngọc Rồng Online Web');
    assert.equal(health.databaseReady, false);
    assert.equal(health.version, '2.0.0');
});
