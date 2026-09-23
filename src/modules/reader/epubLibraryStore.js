async function requestJSON(url, options = {}) {
    const res = await fetch(url, {
        cache: 'no-store',
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.success === false) {
        throw new Error(payload.error || `Request failed: ${url}`);
    }
    return payload;
}

export const DEFAULT_EPUB_SHELF_ID = 'shelf_default';

export function getEpubBookShelfIds(book = {}) {
    const source = book && typeof book === 'object' ? book : {};
    const ids = new Set([DEFAULT_EPUB_SHELF_ID]);
    if (source.shelfId) ids.add(source.shelfId);
    if (Array.isArray(source.shelfIds)) {
        source.shelfIds.forEach((id) => {
            if (id) ids.add(id);
        });
    }
    return [...ids];
}

export function isEpubBookInShelf(book, shelfId) {
    if (shelfId === 'all') return true;
    return getEpubBookShelfIds(book).includes(shelfId);
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

export function normalizeEpubLibrary(library = {}) {
    const shelves = Array.isArray(library.shelves) ? library.shelves : [];
    const hasDefaultShelf = shelves.some((shelf) => shelf?.id === DEFAULT_EPUB_SHELF_ID);
    const normalizedShelves = hasDefaultShelf
        ? shelves
        : [{ id: DEFAULT_EPUB_SHELF_ID, name: '默认书架', createdAt: null, updatedAt: null }, ...shelves];
    const shelfIds = new Set(normalizedShelves.map((shelf) => shelf.id));
    const books = Array.isArray(library.books)
        ? library.books.filter((book) => book?.id && book?.fileName)
        : [];
    const annotations = Array.isArray(library.annotations) ? library.annotations : [];
    return {
        schemaVersion: library.schemaVersion || 1,
        updatedAt: library.updatedAt || null,
        shelves: normalizedShelves,
        books: books.map((book) => {
            const validIds = getEpubBookShelfIds(book).filter((id) => shelfIds.has(id));
            if (!validIds.includes(DEFAULT_EPUB_SHELF_ID)) validIds.unshift(DEFAULT_EPUB_SHELF_ID);
            return {
                ...book,
                shelfId: shelfIds.has(book.shelfId) ? book.shelfId : DEFAULT_EPUB_SHELF_ID,
                shelfIds: [...new Set(validIds)],
            };
        }),
        annotations,
    };
}

export async function loadEpubLibrary() {
    const payload = await requestJSON('/api/epub/library');
    return normalizeEpubLibrary(payload.library);
}

export async function createEpubShelf(name) {
    const payload = await requestJSON('/api/epub/shelf', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
    return normalizeEpubLibrary(payload.library);
}

export async function deleteEpubShelf(shelfId) {
    const payload = await requestJSON(`/api/epub/shelf/${encodeURIComponent(shelfId)}`, {
        method: 'DELETE',
    });
    return normalizeEpubLibrary(payload.library);
}

export async function importEpubFile(file, shelfId = 'shelf_default') {
    if (!file) throw new Error('请选择 EPUB 文件。');
    if (!file.name.toLowerCase().endsWith('.epub')) {
        throw new Error('目前只支持 .epub 文件。');
    }

    const buffer = await file.arrayBuffer();
    const payload = await requestJSON('/api/epub/import', {
        method: 'POST',
        body: JSON.stringify({
            name: file.name,
            shelfId,
            dataBase64: arrayBufferToBase64(buffer),
        }),
    });
    return {
        book: payload.book,
        library: normalizeEpubLibrary(payload.library),
    };
}

export async function updateEpubBook(bookId, patch) {
    const payload = await requestJSON(`/api/epub/book/${encodeURIComponent(bookId)}`, {
        method: 'POST',
        body: JSON.stringify(patch),
    });
    return normalizeEpubLibrary(payload.library);
}

export async function saveEpubAnnotation(annotation) {
    const payload = await requestJSON('/api/epub/annotation', {
        method: 'POST',
        body: JSON.stringify(annotation),
    });
    return {
        annotation: payload.annotation,
        library: normalizeEpubLibrary(payload.library),
    };
}

export async function deleteEpubAnnotation(annotationId) {
    const payload = await requestJSON(`/api/epub/annotation/${encodeURIComponent(annotationId)}`, {
        method: 'DELETE',
    });
    return normalizeEpubLibrary(payload.library);
}

export function epubFileUrl(bookId, fileName = 'book.epub') {
    const safeFileName = String(fileName || 'book.epub').toLowerCase().endsWith('.epub')
        ? String(fileName || 'book.epub')
        : `${fileName}.epub`;
    return `/api/epub/file/${encodeURIComponent(bookId)}/${encodeURIComponent(safeFileName)}`;
}
