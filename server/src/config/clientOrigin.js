const configuredOrigin = process.env.CLIENT_ORIGIN ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');

if (!configuredOrigin) {
    throw new Error('CLIENT_ORIGIN là bắt buộc trong production.');
}

function isPrivateIpv4(hostname) {
    const octets = hostname.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }

    return octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168);
}

function isAllowedClientOrigin(origin) {
    if (!origin || origin === configuredOrigin) return true;
    if (process.env.NODE_ENV === 'production') return false;

    try {
        const url = new URL(origin);
        const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        return url.protocol === 'http:' && url.port === '5173' &&
            (isLocalhost || isPrivateIpv4(url.hostname));
    } catch {
        return false;
    }
}

function corsOrigin(origin, callback) {
    callback(null, isAllowedClientOrigin(origin));
}

module.exports = { configuredOrigin, corsOrigin, isAllowedClientOrigin };
