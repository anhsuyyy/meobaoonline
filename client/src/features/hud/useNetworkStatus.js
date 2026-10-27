import { useEffect, useRef, useState } from 'react';
import networkInstance from '../../game/network';

const INITIAL_STATUS = {
    connection: 'connecting',
    pingMs: null,
    serverTickRate: null,
    measuredTickRate: null,
    jitterMs: null,
    players: 0,
    monsters: 0
};

export default function useNetworkStatus() {
    const [status, setStatus] = useState(INITIAL_STATUS);
    const samples = useRef({ pings: [], tickIntervals: [], lastTickAt: null, connection: 'connecting', serverTickRate: null, players: 0, monsters: 0 });

    useEffect(() => {
        const onConnection = (event) => {
            samples.current.connection = event.detail?.status || 'offline';
            setStatus((previous) => ({ ...previous, connection: samples.current.connection }));
        };
        const onPing = (event) => {
            const pingMs = event.detail?.pingMs;
            if (!Number.isFinite(pingMs) || pingMs < 0) return;
            samples.current.pings.push(pingMs);
            if (samples.current.pings.length > 5) samples.current.pings.shift();
        };
        const onTick = (event) => {
            const detail = event.detail || {};
            const now = detail.receivedAt;
            if (Number.isFinite(now) && samples.current.lastTickAt !== null) {
                samples.current.tickIntervals.push(now - samples.current.lastTickAt);
                if (samples.current.tickIntervals.length > 40) samples.current.tickIntervals.shift();
            }
            if (Number.isFinite(now)) samples.current.lastTickAt = now;
            samples.current.players = detail.players || 0;
            samples.current.monsters = detail.monsters || 0;
        };
        const onServerConfig = (event) => {
            samples.current.serverTickRate = event.detail?.tickRateHz || null;
        };

        window.addEventListener('game:network-connection', onConnection);
        window.addEventListener('game:network-ping', onPing);
        window.addEventListener('game:network-tick', onTick);
        window.addEventListener('game:network-config', onServerConfig);
        const socket = networkInstance.getSocket();
        if (socket?.connected) samples.current.connection = 'connected';
        if (Number.isFinite(socket?.gameTickRateHz)) samples.current.serverTickRate = socket.gameTickRateHz;
        const timer = window.setInterval(() => {
            const current = samples.current;
            const avgPing = current.pings.length
                ? current.pings.reduce((sum, value) => sum + value, 0) / current.pings.length
                : null;
            const avgTick = current.tickIntervals.length
                ? current.tickIntervals.reduce((sum, value) => sum + value, 0) / current.tickIntervals.length
                : null;
            const jitter = avgTick === null
                ? null
                : current.tickIntervals.reduce((sum, value) => sum + Math.abs(value - avgTick), 0) / current.tickIntervals.length;
            setStatus({
                connection: current.connection,
                pingMs: avgPing === null ? null : Math.round(avgPing),
                serverTickRate: current.serverTickRate,
                measuredTickRate: avgTick === null ? null : Math.round(1000 / avgTick),
                jitterMs: jitter === null ? null : Math.round(jitter * 10) / 10,
                players: current.players,
                monsters: current.monsters
            });
        }, 1000);

        return () => {
            window.clearInterval(timer);
            window.removeEventListener('game:network-connection', onConnection);
            window.removeEventListener('game:network-ping', onPing);
            window.removeEventListener('game:network-tick', onTick);
            window.removeEventListener('game:network-config', onServerConfig);
        };
    }, []);

    return status;
}
