import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerCompatibilityNotice, getServerUnavailableNotice } from '../src/features/auth/serverCompatibility.js';

test('accepts the NRO backend health response', () => {
    assert.equal(getServerCompatibilityNotice({ mode: 'nro', game: 'Ngọc Rồng Online Web', databaseReady: true }), null);
});

test('warns when gameplay is online but the database is unavailable', () => {
    assert.match(getServerCompatibilityNotice({ mode: 'nro', databaseReady: false }), /dịch vụ dữ liệu chưa sẵn sàng/);
});

test('warns when the backend is legacy or does not report a game mode', () => {
    assert.match(getServerCompatibilityNotice({ game: 'Mèo Đa Vũ Trụ Online' }), /phiên bản game cũ/);
    assert.match(getServerCompatibilityNotice({ mode: 'legacy' }), /phiên bản game cũ/);
});

test('shows a separate notice when the backend health request fails', () => {
    assert.match(getServerUnavailableNotice(), /Chưa kết nối được máy chủ game/);
});
