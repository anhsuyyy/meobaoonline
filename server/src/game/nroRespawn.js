/** Keeps a dead NRO character inert until the player picks a respawn option. */
function tickNroRespawn(player) {
    if (!player) return { state: 'missing' };
    if (player.hp > 0) {
        player.respawnAt = 0;
        return { state: 'alive' };
    }

    player.input = { left: false, right: false, up: false, down: false, jump: false, flight: false, axisX: 0, axisY: 0 };
    player.isAuto = false;
    player.respawnAt = 0;
    return { state: 'dead', remainingMs: 0 };
}

module.exports = { tickNroRespawn };
