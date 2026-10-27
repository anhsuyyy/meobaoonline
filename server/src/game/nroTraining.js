const powerLimits = require('../../../shared/nro/maps/power-limits.json');

function getNroPowerLimit(limitPower = 0) {
    const index = Math.max(0, Math.min(powerLimits.length - 1, Math.floor(Number(limitPower) || 0)));
    return powerLimits[index];
}

function getTrainingCost(statType, points, stats) {
    const count = BigInt(points);
    if (statType === 0) {
        const increase = count * 20n;
        return count * (2n * (BigInt(stats.hp) + 1000n) + increase - 20n) / 2n;
    }
    if (statType === 1) {
        const increase = count * 20n;
        return count * (2n * (BigInt(stats.mp) + 1000n) + increase - 20n) / 2n;
    }
    if (statType === 2) return count * (2n * BigInt(stats.damage) + count - 1n) / 2n * 100n;
    if (statType === 3) return BigInt(stats.defense + 5) * 100_000n;
    if (statType === 4) {
        let cost = 50_000_000n;
        for (let index = 0; index < stats.critical; index++) cost *= 5n;
        return cost;
    }
    return null;
}

function trainNroStat({ statType, points, potential, stats, limit }) {
    if (!Number.isInteger(statType) || statType < 0 || statType > 4) return { ok: false, message: 'Loại chỉ số không hợp lệ.' };
    if (!Number.isInteger(points) || points < 1 || points > 100) return { ok: false, message: 'Số điểm phải từ 1 đến 100.' };
    if (!stats || !limit) return { ok: false, message: 'Dữ liệu giới hạn chỉ số chưa sẵn sàng.' };

    const nextStats = { ...stats };
    const fields = ['hp', 'mp', 'damage', 'defense', 'critical'];
    const field = fields[statType];
    const delta = statType <= 1 ? points * 20 : points;
    const cap = limit[field];
    if (nextStats[field] + delta > cap) {
        return { ok: false, message: `${['HP', 'KI', 'sức đánh', 'giáp', 'chí mạng'][statType]} đã đạt giới hạn hiện tại (${cap.toLocaleString()}).` };
    }

    const cost = getTrainingCost(statType, points, stats);
    const available = BigInt(Math.max(0, Math.floor(Number(potential) || 0)));
    if (available < cost) {
        return { ok: false, message: `Không đủ tiềm năng. Cần ${cost.toLocaleString()} điểm.` };
    }
    nextStats[field] += delta;
    return { ok: true, stats: nextStats, potential: Number(available - cost), cost: Number(cost) };
}

module.exports = { getNroPowerLimit, getTrainingCost, trainNroStat };
