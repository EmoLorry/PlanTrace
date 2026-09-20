const VERSION = 5;
const SIZE = 21 + (VERSION - 1) * 4;
const DATA_CODEWORDS = 108;
const ECC_CODEWORDS = 26;
const FORMAT_ECL_LOW = 1;

const GF_EXP = [];
const GF_LOG = [];

let x = 1;
for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
}
for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
        const root = GF_EXP[i];
        const next = Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j += 1) {
            next[j] ^= poly[j];
            next[j + 1] ^= gfMul(poly[j], root);
        }
        poly = next;
    }
    return poly;
}

const RS_GEN = rsGenerator(ECC_CODEWORDS);

function rsRemainder(data) {
    const msg = [...data, ...Array(ECC_CODEWORDS).fill(0)];
    for (let i = 0; i < data.length; i += 1) {
        const factor = msg[i];
        if (factor === 0) continue;
        for (let j = 0; j < RS_GEN.length; j += 1) {
            msg[i + j] ^= gfMul(RS_GEN[j], factor);
        }
    }
    return msg.slice(data.length);
}

function pushBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i -= 1) {
        bits.push((value >>> i) & 1);
    }
}

function encodeData(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    if (bytes.length > 106) {
        throw new Error(`QR frame too large: ${bytes.length} bytes`);
    }

    const bits = [];
    pushBits(bits, 0b0100, 4); // byte mode
    pushBits(bits, bytes.length, 8);
    bytes.forEach((byte) => pushBits(bits, byte, 8));

    const capacityBits = DATA_CODEWORDS * 8;
    pushBits(bits, 0, Math.min(4, capacityBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
        codewords.push(byte);
    }

    let pad = 0xEC;
    while (codewords.length < DATA_CODEWORDS) {
        codewords.push(pad);
        pad = pad === 0xEC ? 0x11 : 0xEC;
    }

    return [...codewords, ...rsRemainder(codewords)];
}

function createMatrix() {
    return {
        modules: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
        reserved: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
    };
}

function setModule(matrix, xPos, yPos, value, reserve = true) {
    if (xPos < 0 || yPos < 0 || xPos >= SIZE || yPos >= SIZE) return;
    matrix.modules[yPos][xPos] = Boolean(value);
    if (reserve) matrix.reserved[yPos][xPos] = true;
}

function drawFinder(matrix, xPos, yPos) {
    for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
            const xx = xPos + x;
            const yy = yPos + y;
            if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
            const black = (
                x >= 0 && x <= 6 && y >= 0 && y <= 6
                && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4))
            );
            setModule(matrix, xx, yy, black);
        }
    }
}

function drawAlignment(matrix, cx, cy) {
    for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) {
            const dist = Math.max(Math.abs(x), Math.abs(y));
            setModule(matrix, cx + x, cy + y, dist === 2 || dist === 0);
        }
    }
}

function drawFunctionPatterns(matrix) {
    drawFinder(matrix, 0, 0);
    drawFinder(matrix, SIZE - 7, 0);
    drawFinder(matrix, 0, SIZE - 7);
    drawAlignment(matrix, 30, 30);

    for (let i = 8; i < SIZE - 8; i += 1) {
        setModule(matrix, i, 6, i % 2 === 0);
        setModule(matrix, 6, i, i % 2 === 0);
    }

    setModule(matrix, 8, SIZE - 8, true);

    for (let i = 0; i <= 8; i += 1) {
        if (i !== 6) {
            matrix.reserved[8][i] = true;
            matrix.reserved[i][8] = true;
        }
    }
    for (let i = 0; i < 8; i += 1) {
        matrix.reserved[8][SIZE - 1 - i] = true;
        matrix.reserved[SIZE - 1 - i][8] = true;
    }
}

function maskBit(xPos, yPos) {
    return (xPos + yPos) % 2 === 0;
}

function drawData(matrix, codewords) {
    const bits = [];
    codewords.forEach((byte) => pushBits(bits, byte, 8));

    let bitIndex = 0;
    let upward = true;
    for (let right = SIZE - 1; right >= 1; right -= 2) {
        if (right === 6) right -= 1;
        for (let vert = 0; vert < SIZE; vert += 1) {
            const yPos = upward ? SIZE - 1 - vert : vert;
            for (let j = 0; j < 2; j += 1) {
                const xPos = right - j;
                if (matrix.reserved[yPos][xPos]) continue;
                const raw = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
                matrix.modules[yPos][xPos] = raw !== maskBit(xPos, yPos);
                bitIndex += 1;
            }
        }
        upward = !upward;
    }
}

function getFormatBits(mask) {
    const data = (FORMAT_ECL_LOW << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) {
        rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
    }
    return ((data << 10) | rem) ^ 0x5412;
}

function drawFormatBits(matrix) {
    const bits = getFormatBits(0);
    const bit = (i) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i += 1) setModule(matrix, 8, i, bit(i));
    setModule(matrix, 8, 7, bit(6));
    setModule(matrix, 8, 8, bit(7));
    setModule(matrix, 7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) setModule(matrix, 14 - i, 8, bit(i));

    for (let i = 0; i < 8; i += 1) setModule(matrix, SIZE - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) setModule(matrix, 8, SIZE - 15 + i, bit(i));
    setModule(matrix, 8, SIZE - 8, true);
}

export function createQrMatrix(text) {
    const matrix = createMatrix();
    drawFunctionPatterns(matrix);
    drawData(matrix, encodeData(text));
    drawFormatBits(matrix);
    return matrix.modules;
}

export function createQrSvg(text, { moduleSize = 8, quiet = 4 } = {}) {
    const modules = createQrMatrix(text);
    const total = SIZE + quiet * 2;
    const size = total * moduleSize;
    const rects = [];

    for (let y = 0; y < SIZE; y += 1) {
        for (let xPos = 0; xPos < SIZE; xPos += 1) {
            if (!modules[y][xPos]) continue;
            rects.push(`<rect x="${(xPos + quiet) * moduleSize}" y="${(y + quiet) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`);
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" shape-rendering="crispEdges" role="img" aria-label="PlanTrace transfer QR"><rect width="${size}" height="${size}" fill="#fff"/> <g fill="#111">${rects.join('')}</g></svg>`;
}
