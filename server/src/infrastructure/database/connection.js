const dns = require('dns');
const mongoose = require('mongoose');
const User = require('../../modules/auth/userModel');

let isConnected = false;

function getMongoHostname(uri) {
    let parsedUri;
    try {
        parsedUri = new URL(uri);
    } catch {
        throw new Error('MONGODB_URI must be a valid MongoDB connection URI.');
    }

    if (!['mongodb:', 'mongodb+srv:'].includes(parsedUri.protocol) || !parsedUri.hostname) {
        throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv:// and include a hostname.');
    }

    return parsedUri.hostname;
}

async function connectDatabase() {
    const uri = process.env.MONGODB_URI?.trim();
    if (!uri) {
        isConnected = false;
        throw new Error('MONGODB_URI is required. Set it in the repository root .env file or the process environment.');
    }

    const dnsServers = process.env.MONGODB_DNS_SERVERS
        ?.split(',')
        .map((server) => server.trim())
        .filter(Boolean);
    if (dnsServers?.length) {
        try {
            dns.setServers(dnsServers);
        } catch {
            throw new Error('MONGODB_DNS_SERVERS must be a comma-separated list of valid DNS server IP addresses.');
        }
    }

    const hostname = getMongoHostname(uri);
    console.log(`[Database] Connecting to MongoDB host: ${hostname}`);

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000
        });
        await User.init();
        isConnected = true;
        console.log(`[Database] Connected to MongoDB host: ${hostname}`);
    } catch (err) {
        isConnected = false;
        const errorCode = typeof err.code === 'string' || typeof err.code === 'number'
            ? `, code: ${err.code}`
            : '';
        const syscall = typeof err.syscall === 'string' ? ` during ${err.syscall}` : '';
        const authFailure = /authentication failed|bad auth/i.test(err.message || '');
        const authContext = authFailure ? '; Atlas rejected the database credentials' : '';
        console.error(`[Database] Connection to MongoDB host ${hostname} failed (${err.name}${errorCode}${syscall}${authContext}).`);
        await mongoose.disconnect();
        throw new Error(`MongoDB connection failed for ${hostname}. Check Atlas availability, network access, and credentials.`);
    }
}

function isDbConnected() {
    return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
    connectDatabase,
    isDbConnected
};
