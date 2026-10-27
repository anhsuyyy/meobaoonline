import test from 'node:test';
import assert from 'node:assert/strict';
import { findNearbyNroWaypoint, getWaypointPromptPosition } from '../src/game/mapInteraction.js';

test('finds only a waypoint whose authored trigger contains the player', () => {
    const waypoints = [
        ['Đồi hoa cúc', 1224, 408, 1248, 432, 0, 0, 1, 60, 384],
        ['Nhà Gôhan', 288, 408, 360, 432, 1, 1, 21, 489, 336]
    ];

    assert.equal(findNearbyNroWaypoint({ x: 1236, y: 420 }, waypoints)?.destinationMapId, 1);
    assert.equal(findNearbyNroWaypoint({ x: 800, y: 420 }, waypoints), null);
    assert.equal(findNearbyNroWaypoint({ x: NaN, y: 420 }, waypoints), null);
});

test('chooses the closest overlapping waypoint and derives its button label from source map data', () => {
    const waypoints = [
        ['Far portal', 0, 0, 48, 48, 0, 0, 1, 50, 50],
        ['Near portal', 20, 20, 40, 40, 0, 0, 2, 60, 60]
    ];
    assert.deepEqual(findNearbyNroWaypoint({ x: 30, y: 30 }, waypoints), {
        entry: waypoints[1], destinationMapId: 2, mapName: 'Near portal'
    });
});

test('places the waypoint prompt using camera scroll and zoom', () => {
    assert.deepEqual(getWaypointPromptPosition(
        ['Portal', 100, 200, 124, 224],
        { x: 0, y: 0, scrollX: 50, scrollY: 100, zoom: 2 },
        800, 600
    ), { left: '15.5%', top: '37.333333333333336%' });
});
