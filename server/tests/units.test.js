const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { metersToPixels, pixelsToMeters } = require('../src/game/units');

describe('world unit conversion', () => {
    it('converts meters to pixels and back using the configured 10px/m scale', () => {
        assert.equal(metersToPixels(5, 10), 50);
        assert.equal(metersToPixels(6, 10), 60);
        assert.equal(metersToPixels(20, 10), 200);
        assert.equal(pixelsToMeters(200, 10), 20);
    });
});
