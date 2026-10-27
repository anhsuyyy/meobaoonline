import assert from 'node:assert/strict';
import test from 'node:test';
import {
    findNearbyNroNpc,
    getNpcPromptPosition,
    NRO_NPC_INTERACTION_RANGE_PX
} from '../src/game/npcInteraction.js';

test('nearby NPC selection uses the server interaction range and picks the closest NPC', () => {
    const npcs = [[7, 40, 40], [8, 59, 40], [9, 100, 40]];
    assert.equal(NRO_NPC_INTERACTION_RANGE_PX, 60);
    assert.deepEqual(findNearbyNroNpc({ x: 0, y: 40 }, npcs), npcs[0]);
    assert.equal(findNearbyNroNpc({ x: 0, y: 40 }, [[7, 61, 40]]), null);
    assert.deepEqual(findNearbyNroNpc({ x: 0, y: 40 }, [[7, 60, 40]], 60), [7, 60, 40]);
});

test('nearby NPC selection ignores malformed entries and invalid player positions', () => {
    assert.deepEqual(findNearbyNroNpc({ x: 0, y: 0 }, [null, ['x', 1, 1], [2, NaN, 0], [3, 2, 2]]), [3, 2, 2]);
    assert.equal(findNearbyNroNpc({ x: Infinity, y: 0 }, [[1, 0, 0]]), null);
    assert.equal(findNearbyNroNpc({ x: 0, y: 0 }, [[1, 0, 0]], -1), null);
});

test('NPC prompt position follows camera offset and zoom in scene coordinates', () => {
    const position = getNpcPromptPosition([7, 200, 100], {
        x: 0, y: 0, scrollX: 100, scrollY: 20, zoom: 2
    }, 1280, 720);
    assert.equal(position.left, '15.625%');
    assert.equal(position.top, `${130 / 720 * 100}%`);
});

test('NPC prompt position clamps to the visible HUD region and rejects invalid viewports', () => {
    assert.deepEqual(getNpcPromptPosition([7, -500, -500], {
        x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1
    }, 1280, 720), { left: '7%', top: '12%' });
    assert.equal(getNpcPromptPosition([7, 1, 1], { zoom: 0 }, 1280, 720), null);
});

test('NPC prompt stays above the bottom chat and touch-control region', () => {
    const position = getNpcPromptPosition([7, 200, 700], {
        x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1
    }, 1280, 720);
    assert.equal(position.top, '72%');
});
