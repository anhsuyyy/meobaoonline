export const NRO_REMOTE_INTERPOLATION_DELAY_MS = 100;

const MAX_SNAPSHOT_HISTORY = 32;

export function pushPositionSnapshot(history, data, receivedAt, maxHistory = MAX_SNAPSHOT_HISTORY) {
    if (!Number.isFinite(data?.x) || !Number.isFinite(data?.y) || !Number.isFinite(receivedAt)) return history || [];
    const snapshots = Array.isArray(history) ? history : [];
    const last = snapshots.at(-1);
    if (last && receivedAt < last.receivedAt) return snapshots;

    const snapshot = {
        x: data.x,
        y: data.y,
        facing: data.facing === -1 ? -1 : 1,
        receivedAt
    };
    if (last && receivedAt === last.receivedAt) snapshots[snapshots.length - 1] = snapshot;
    else snapshots.push(snapshot);
    while (snapshots.length > Math.max(2, maxHistory)) snapshots.shift();
    return snapshots;
}

export function samplePositionSnapshot(history, renderAt) {
    if (!Array.isArray(history) || history.length === 0 || !Number.isFinite(renderAt)) return null;

    while (history.length > 2 && history[1].receivedAt <= renderAt) history.shift();
    const from = history[0];
    const to = history[1];
    if (!to || renderAt <= from.receivedAt) return { x: from.x, y: from.y, facing: from.facing };
    if (renderAt >= to.receivedAt) return { x: to.x, y: to.y, facing: to.facing };

    const duration = to.receivedAt - from.receivedAt;
    const alpha = duration > 0 ? (renderAt - from.receivedAt) / duration : 1;
    return {
        x: from.x + (to.x - from.x) * alpha,
        y: from.y + (to.y - from.y) * alpha,
        facing: alpha < 0.5 ? from.facing : to.facing
    };
}
