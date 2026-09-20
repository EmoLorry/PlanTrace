import { APP_VERSION } from '../version.js';
import { createBackupPayload } from './storage.js';

const CHUNK_SIZE = 84;

function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function gzipString(text) {
    if (!('CompressionStream' in window)) return null;

    const stream = new Blob([text], { type: 'application/json' })
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function chunkString(value, size) {
    const chunks = [];
    for (let i = 0; i < value.length; i += size) {
        chunks.push(value.slice(i, i + size));
    }
    return chunks;
}

function makeFrameId() {
    return Date.now().toString(36).slice(-6);
}

export async function createMobileTransferPackage() {
    const payload = await createBackupPayload();
    const envelope = {
        type: 'plantrace-mobile-pack',
        appVersion: APP_VERSION,
        createdAt: new Date().toISOString(),
        payload,
    };
    const json = JSON.stringify(envelope);
    const gzipped = await gzipString(json);
    const encoded = gzipped
        ? `G.${bytesToBase64Url(gzipped)}`
        : `J.${bytesToBase64Url(new TextEncoder().encode(json))}`;

    const id = makeFrameId();
    const chunks = chunkString(encoded, CHUNK_SIZE);
    const total = chunks.length;
    const frames = chunks.map((chunk, index) => (
        `PT1|${id}|${index.toString(36)}|${total.toString(36)}|${chunk}`
    ));

    return {
        id,
        envelope,
        json,
        encoded,
        frames,
        total,
        byteLength: new TextEncoder().encode(json).length,
        encodedLength: encoded.length,
        compressed: Boolean(gzipped),
    };
}

export function downloadMobileTransferPackage(pkg) {
    const blob = new Blob([pkg.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `plantrace_mobile_pack_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importMobileTransferFile(file) {
    const text = await file.text();
    const pack = JSON.parse(text);
    const res = await fetch('/api/data/mobile-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.success === false) {
        throw new Error(payload.error || 'Mobile import failed.');
    }
    return payload.stats;
}
