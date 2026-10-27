const clientUrl = new URL(process.env.NRO_CLIENT_URL || 'http://127.0.0.1:5173');
const serverUrl = new URL(process.env.NRO_SERVER_URL || 'http://127.0.0.1:3000');

async function expectResponse(url, expectedType, label, options = {}) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status} at ${url}`);
    const contentType = response.headers.get('content-type') || '';
    if (!expectedType.test(contentType)) {
        throw new Error(`${label}: expected ${expectedType}, got "${contentType}" at ${url}`);
    }
    console.log(`PASS ${label}: HTTP ${response.status} (${contentType.split(';')[0]})`);
    return response;
}

const healthResponse = await expectResponse(new URL('/health', serverUrl), /application\/json/i, 'NRO server health');
const health = await healthResponse.json();
if (health.mode !== 'nro' || health.game !== 'Ngọc Rồng Online Web') {
    throw new Error(`Wrong backend is running: game="${health.game}", mode="${health.mode || 'missing'}"`);
}
if (health.databaseReady !== true) throw new Error('NRO backend is reachable but its database is not ready.');

const clientResponse = await expectResponse(new URL('/', clientUrl), /text\/html/i, 'Game client');
const html = await clientResponse.text();
if (!html.includes('<div id="root"></div>')) throw new Error('Game client HTML is missing the React root element.');

const assets = [
    ['/assets/nro/generated/player-earth-64.png', /image\/png/i, 'Earth player sprite'],
    ['/assets/nro/generated/npcs/7.svg', /image\/svg\+xml/i, 'Bunma artwork'],
    ['/assets/nro/generated/mobs/0.svg', /image\/svg\+xml/i, 'Wooden dummy artwork'],
    ['/assets/nro/generated/tiles/1-20.svg', /image\/svg\+xml/i, 'Starter map terrain']
];
for (const [path, type, label] of assets) {
    await expectResponse(new URL(path, clientUrl), type, label);
}

async function checkSocketHandshake(baseUrl, label, origin) {
    const socketUrl = new URL('/socket.io/', baseUrl);
    socketUrl.searchParams.set('EIO', '4');
    socketUrl.searchParams.set('transport', 'polling');
    let socketId;
    try {
        const response = await expectResponse(socketUrl, /text\/plain/i, `${label} transport`, origin ? { headers: { Origin: origin } } : {});
        const packet = await response.text();
        if (!packet.startsWith('0')) throw new Error(`${label} did not complete its open handshake: ${packet.slice(0, 100)}`);
        socketId = JSON.parse(packet.slice(1)).sid;
        console.log(`PASS ${label} Engine.IO handshake`);
    } finally {
        if (socketId) {
            const closeUrl = new URL('/socket.io/', baseUrl);
            closeUrl.searchParams.set('EIO', '4');
            closeUrl.searchParams.set('transport', 'polling');
            closeUrl.searchParams.set('sid', socketId);
            await fetch(closeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: '1',
            signal: AbortSignal.timeout(3000)
            }).catch(() => {});
        }
    }
}
await checkSocketHandshake(serverUrl, 'Socket.IO local', null);

if (process.env.NRO_LAN_HOST) {
    const lanHost = process.env.NRO_LAN_HOST;
    const lanClientUrl = new URL(`http://${lanHost}:5173`);
    const lanServerUrl = new URL(`http://${lanHost}:3000`);
    const lanOrigin = lanClientUrl.origin;
    await expectResponse(new URL('/', lanClientUrl), /text\/html/i, 'LAN game client');
    const lanHealthResponse = await expectResponse(new URL('/health', lanServerUrl), /application\/json/i, 'LAN NRO server', {
        headers: { Origin: lanOrigin }
    });
    const allowedOrigin = lanHealthResponse.headers.get('access-control-allow-origin');
    if (allowedOrigin !== lanOrigin) throw new Error(`LAN API CORS rejected ${lanOrigin} (allow-origin=${allowedOrigin || 'missing'}).`);
    console.log(`PASS LAN API CORS: ${allowedOrigin}`);
    for (const route of ['login', 'register']) {
        const authProbe = await fetch(new URL(`/api/auth/${route}`, lanServerUrl), {
            method: 'POST',
            headers: { Origin: lanOrigin, 'Content-Type': 'application/json' },
            body: '{}',
            signal: AbortSignal.timeout(8000)
        });
        if (authProbe.status !== 400 || authProbe.headers.get('access-control-allow-origin') !== lanOrigin) {
            throw new Error(`LAN ${route} route probe failed (HTTP ${authProbe.status}, CORS=${authProbe.headers.get('access-control-allow-origin') || 'missing'}).`);
        }
    }
    console.log('PASS LAN login/register routes and CORS (empty credentials rejected before any database write)');
    await checkSocketHandshake(lanServerUrl, 'Socket.IO LAN', lanOrigin);
}

console.log('NRO runtime smoke check passed. Authenticated gameplay still requires a player session.');
