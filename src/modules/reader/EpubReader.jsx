import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ePub from 'epubjs';
import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    Highlighter,
    Library,
    ListTree,
    Plus,
    Quote,
    Trash2,
    Type,
    Underline,
    Upload,
    X,
} from 'lucide-react';
import TextExperienceControls from '../../components/TextExperienceControls.jsx';
import { getTextSurface } from '../../components/textExperience.js';
import { createEmptyDiary, noteId, readDiary, writeDiary } from '../../store/diaryStore.js';
import { getTodayBJ } from '../../store/dateUtils.js';
import {
    createEpubShelf,
    DEFAULT_EPUB_SHELF_ID,
    deleteEpubAnnotation,
    deleteEpubShelf,
    epubFileUrl,
    getEpubBookShelfIds,
    importEpubFile,
    isEpubBookInShelf,
    loadEpubLibrary,
    saveEpubAnnotation,
    updateEpubBook,
} from './epubLibraryStore.js';

const DEFAULT_READER_SETTINGS = {
    fontSize: 18,
    lineHeight: 1.65,
    surface: 'paper',
};

const HIGHLIGHT_COLORS = [
    { id: 'ochre', label: '赭金', value: '#d8a766' },
    { id: 'sage', label: '鼠尾草', value: '#7fb7a0' },
    { id: 'bluegrey', label: '雾蓝', value: '#83a9c4' },
    { id: 'rosewood', label: '玫瑰灰', value: '#d98291' },
];

const DISPLAY_TIMEOUT_MS = 18000;
const NAVIGATION_TIMEOUT_MS = 6000;
const NAVIGATION_SETTLE_MS = 140;
const TEMP_SELECTION_COLOR = '#7dd3fc';
const TEXT_CURSOR_CSS = 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M9 3h6M12 3v18M9 21h6%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%274%27 stroke-linecap=%27round%27/%3E%3Cpath d=%27M9 3h6M12 3v18M9 21h6%27 fill=%27none%27 stroke=%27%23007aff%27 stroke-width=%272%27 stroke-linecap=%27round%27/%3E%3C/svg%3E") 12 12, text';

function normalizeReaderSettings(settings = {}) {
    const rawFontSize = Number(settings.fontSize) || DEFAULT_READER_SETTINGS.fontSize;
    return {
        fontSize: rawFontSize > 48 ? DEFAULT_READER_SETTINGS.fontSize : rawFontSize,
        lineHeight: Number(settings.lineHeight) || DEFAULT_READER_SETTINGS.lineHeight,
        surface: settings.surface || settings.theme || DEFAULT_READER_SETTINGS.surface,
    };
}

function getBookTitle(book) {
    return book?.title || book?.originalName?.replace(/\.epub$/i, '') || '未命名书籍';
}

function getBookAnnotations(library, bookId) {
    return (library.annotations || []).filter((item) => item.bookId === bookId);
}

function flattenToc(items = [], level = 0) {
    return items.flatMap((item) => {
        const href = item.href || item.url || '';
        const label = item.label || item.title || href || '未命名章节';
        const current = href ? [{ href, label, level }] : [];
        const children = flattenToc(item.subitems || item.children || [], level + 1);
        return [...current, ...children];
    });
}

function withTimeout(promise, ms, message) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSpineItems(book) {
    return Array.isArray(book?.spine?.spineItems) ? book.spine.spineItems : [];
}

function isLikelyReadableSpineItem(item) {
    const idref = String(item?.idref || '').toLowerCase();
    const href = String(item?.href || '').toLowerCase();
    const properties = String(item?.properties || '').toLowerCase();
    if (!href || item?.linear === 'no' || item?.linear === false) return false;
    if (!/\.(xhtml|html|htm)(#.*)?$/.test(href)) return false;
    if (idref === 'toc' || idref.includes('nav') || href.includes('navigation')) return false;
    if (idref.includes('cover') || href.includes('cover')) return false;
    if (properties.includes('nav') || properties.includes('pre-paginated')) return false;
    return true;
}

function getLocationSpineIndex(book, location) {
    const rawIndex = Number(location?.start?.index);
    if (Number.isFinite(rawIndex)) return rawIndex;

    const href = location?.start?.href || location?.end?.href;
    if (!href) return -1;
    const targetBase = normalizeHref(href, { keepHash: false });
    return getSpineItems(book).findIndex((item) => {
        const base = normalizeHref(item.href, { keepHash: false });
        return base && (base === targetBase || base.endsWith(targetBase) || targetBase.endsWith(base));
    });
}

function findAdjacentReadableSpineItem(book, fromIndex, direction) {
    const spineItems = getSpineItems(book);
    if (!spineItems.length) return null;
    const step = direction < 0 ? -1 : 1;
    let index = Number.isFinite(fromIndex) && fromIndex >= 0
        ? fromIndex + step
        : (step > 0 ? 0 : spineItems.length - 1);

    while (index >= 0 && index < spineItems.length) {
        const item = spineItems[index];
        if (isLikelyReadableSpineItem(item)) return item;
        index += step;
    }
    return null;
}

function getReaderScrollSnapshot(rendition) {
    const manager = rendition?.manager;
    const container = manager?.container;
    return {
        top: Math.round(container?.scrollTop ?? manager?.scrollTop ?? 0),
        left: Math.round(container?.scrollLeft ?? manager?.scrollLeft ?? 0),
    };
}

function getReaderNavigationSnapshot(rendition) {
    const location = rendition?.location;
    const scroll = getReaderScrollSnapshot(rendition);
    return {
        cfi: location?.start?.cfi || '',
        index: Number.isFinite(Number(location?.start?.index)) ? Number(location.start.index) : -1,
        href: location?.start?.href || location?.end?.href || '',
        top: scroll.top,
        left: scroll.left,
    };
}

function didReaderMove(before, after) {
    if (!before || !after) return true;
    if (before.cfi && after.cfi && before.cfi !== after.cfi) return true;
    if (before.index !== after.index) return true;
    if (before.href !== after.href) return true;
    if (Math.abs(before.top - after.top) > 3) return true;
    if (Math.abs(before.left - after.left) > 3) return true;
    return false;
}

function scrollToSpineSection(rendition, section, position) {
    const manager = rendition?.manager;
    const container = manager?.container;
    if (!manager || !container || !section) return;

    const view = manager.views?.find?.(section)
        || manager.views?.all?.().find((item) => item?.section?.index === section.index);
    const element = view?.element;
    if (!element) return;

    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const sectionTop = element.offsetTop || 0;
    const sectionBottom = sectionTop + (element.offsetHeight || container.clientHeight);
    const top = position === 'end'
        ? Math.max(sectionTop, sectionBottom - container.clientHeight - 12)
        : sectionTop;

    if (typeof manager.scrollTo === 'function') {
        manager.scrollTo(0, Math.min(maxTop, Math.max(0, top)), true);
    } else {
        container.scrollTop = Math.min(maxTop, Math.max(0, top));
    }
}

function getOpeningTarget(book, savedLocation) {
    if (savedLocation) return savedLocation;
    const spineItems = getSpineItems(book);
    const readable = spineItems.find(isLikelyReadableSpineItem);
    const fallback = spineItems.find((item) => {
        const idref = String(item?.idref || '').toLowerCase();
        const href = String(item?.href || '').toLowerCase();
        return item?.linear !== 'no'
            && href
            && !idref.includes('cover')
            && !href.includes('cover')
            && idref !== 'toc'
            && !href.includes('navigation');
    });
    return readable?.href || fallback?.href || undefined;
}

function getBookDirection(book) {
    const direction = String(book?.package?.metadata?.direction || '').toLowerCase();
    return direction === 'rtl' ? 'rtl' : 'ltr';
}

function normalizeHref(value, { keepHash = true } = {}) {
    const raw = String(value || '').split('?')[0];
    const href = keepHash ? raw : raw.split('#')[0];
    try {
        return decodeURIComponent(href).replace(/^\.?\//, '').toLowerCase();
    } catch {
        return href.replace(/^\.?\//, '').toLowerCase();
    }
}

function findActiveTocHref(items, currentHref) {
    if (!currentHref || !items?.length) return '';
    const currentFull = normalizeHref(currentHref);
    const currentBase = normalizeHref(currentHref, { keepHash: false });
    const exact = items.find((item) => normalizeHref(item.href) === currentFull);
    if (exact) return exact.href;
    const sameChapter = items.find((item) => {
        const base = normalizeHref(item.href, { keepHash: false });
        return base && (base === currentBase || currentBase.endsWith(base) || base.endsWith(currentBase));
    });
    return sameChapter?.href || '';
}

function clampProgress(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function getLocationProgress(location, book) {
    const cfi = location?.start?.cfi;
    if (cfi && book?.locations?.length?.()) {
        const cfiPercentage = Number(book.locations.percentageFromCfi(cfi));
        if (Number.isFinite(cfiPercentage)) return clampProgress(cfiPercentage);
    }

    const percentage = Number(location?.start?.percentage);
    if (Number.isFinite(percentage) && percentage > 0) return clampProgress(percentage);

    const spineItems = getSpineItems(book);
    const index = Number(location?.start?.index);
    if (Number.isFinite(index) && spineItems.length > 0) {
        const displayed = location?.start?.displayed;
        const page = Number(displayed?.page) || 1;
        const total = Number(displayed?.total) || 1;
        const inSectionProgress = total > 1 ? (page - 1) / total : 0;
        return clampProgress((index + inSectionProgress) / spineItems.length);
    }

    return 0;
}

function formatReadingProgress(value) {
    const percent = Math.round(clampProgress(value) * 100);
    return `${percent}%`;
}

function getAnnotationType(annotation) {
    if (annotation?.type === 'underline') return 'underline';
    if (annotation?.type === 'textColor') return 'textColor';
    return 'highlight';
}

function getAnnotationRenderType(annotation) {
    return getAnnotationType(annotation) === 'underline' ? 'underline' : 'highlight';
}

function getAnnotationClass(annotation) {
    const type = getAnnotationType(annotation);
    if (type === 'underline') return 'pt-reader-underline';
    if (type === 'textColor') return 'pt-reader-text-color';
    return 'pt-reader-highlight';
}

function getAnnotationStyles(annotation) {
    const type = getAnnotationType(annotation);
    const color = annotation?.color || HIGHLIGHT_COLORS[0].value;
    if (type === 'underline') {
        return {
            stroke: color,
            'stroke-width': '2',
            'stroke-opacity': '0.9',
        };
    }
    if (type === 'textColor') {
        return {
            fill: color,
            'fill-opacity': '0.16',
            stroke: color,
            'stroke-opacity': '0.38',
            'stroke-width': '1',
            'mix-blend-mode': 'multiply',
        };
    }
    return {
        fill: color,
        'fill-opacity': '0.35',
        'mix-blend-mode': 'multiply',
    };
}

export default function EpubReader({ onClose }) {
    const viewRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);
    const saveLocationTimerRef = useRef(null);
    const fileInputRef = useRef(null);
    const libraryRef = useRef(null);
    const readerSettingsRef = useRef(DEFAULT_READER_SETTINGS);
    const activeAnnotationsRef = useRef([]);
    const loadingReaderSettingsRef = useRef(false);
    const tempSelectionRef = useRef(null);
    const tocItemsRef = useRef([]);
    const tocItemRefs = useRef(new Map());
    const latestLocationRef = useRef(null);
    const currentLocationRef = useRef(null);
    const navigatingRef = useRef(false);

    const [library, setLibrary] = useState({ shelves: [], books: [], annotations: [] });
    const [activeShelfId, setActiveShelfId] = useState('all');
    const [activeBookId, setActiveBookId] = useState(null);
    const [status, setStatus] = useState('正在读取本地书架...');
    const [error, setError] = useState('');
    const [newShelfName, setNewShelfName] = useState('');
    const [importing, setImporting] = useState(false);
    const [readerSettings, setReaderSettings] = useState(DEFAULT_READER_SETTINGS);
    const [selection, setSelection] = useState(null);
    const [selectionNote, setSelectionNote] = useState('');
    const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
    const [annotationType, setAnnotationType] = useState('highlight');
    const [bookDirection, setBookDirection] = useState('ltr');
    const [tocItems, setTocItems] = useState([]);
    const [activeTocHref, setActiveTocHref] = useState('');
    const [readingProgress, setReadingProgress] = useState('');
    const [readingProgressValue, setReadingProgressValue] = useState(0);

    const activeBook = useMemo(
        () => library.books.find((book) => book.id === activeBookId) || null,
        [activeBookId, library.books],
    );
    const activeAnnotations = useMemo(
        () => getBookAnnotations(library, activeBookId),
        [activeBookId, library],
    );
    const shelfById = useMemo(
        () => new Map((library.shelves || []).map((shelf) => [shelf.id, shelf])),
        [library.shelves],
    );
    const customShelves = useMemo(
        () => (library.shelves || []).filter((shelf) => shelf.id !== DEFAULT_EPUB_SHELF_ID),
        [library.shelves],
    );
    const activeShelfBooks = useMemo(() => {
        const books = library.books || [];
        if (activeShelfId === 'all') return books;
        return books.filter((book) => isEpubBookInShelf(book, activeShelfId));
    }, [activeShelfId, library.books]);
    const surface = getTextSurface(readerSettings.surface);

    useEffect(() => {
        libraryRef.current = library;
    }, [library]);

    useEffect(() => {
        readerSettingsRef.current = readerSettings;
    }, [readerSettings]);

    useEffect(() => {
        activeAnnotationsRef.current = activeAnnotations;
    }, [activeAnnotations]);

    useEffect(() => {
        tocItemsRef.current = tocItems;
    }, [tocItems]);

    useEffect(() => {
        const activeElement = tocItemRefs.current.get(activeTocHref);
        activeElement?.scrollIntoView?.({ block: 'nearest' });
    }, [activeTocHref]);

    const refreshLibrary = useCallback(async () => {
        const nextLibrary = await loadEpubLibrary();
        setLibrary(nextLibrary);
        setActiveBookId((current) => current || nextLibrary.books?.[0]?.id || null);
        return nextLibrary;
    }, []);

    const applyReaderSettings = useCallback((settings = readerSettingsRef.current) => {
        const rendition = renditionRef.current;
        if (!rendition) return;
        const nextSurface = getTextSurface(settings.surface);
        rendition.themes.fontSize(`${settings.fontSize}px`);
        rendition.themes.override('line-height', `${settings.lineHeight}`);
        rendition.themes.override('color', nextSurface.color);
        rendition.themes.override('background', nextSurface.background);
    }, []);

    const applyAnnotations = useCallback((annotations = activeAnnotationsRef.current) => {
        const rendition = renditionRef.current;
        if (!rendition?.annotations) return;
        annotations.forEach((annotation) => {
            try {
                const renderType = getAnnotationRenderType(annotation);
                try { rendition.annotations.remove(annotation.cfiRange, renderType); } catch { /* ignore */ }
                const method = renderType === 'underline' ? rendition.annotations.underline : rendition.annotations.highlight;
                method.call(
                    rendition.annotations,
                    annotation.cfiRange,
                    annotation,
                    () => {},
                    getAnnotationClass(annotation),
                    getAnnotationStyles(annotation),
                );
            } catch {
                /* Invalid or stale CFI ranges are ignored. */
            }
        });
    }, []);

    const clearTempSelection = useCallback((restoreSavedAnnotations = true) => {
        const temp = tempSelectionRef.current;
        if (!temp || !renditionRef.current?.annotations) return;
        try { renditionRef.current.annotations.remove(temp.cfiRange, 'highlight'); } catch { /* ignore */ }
        tempSelectionRef.current = null;
        if (restoreSavedAnnotations) {
            window.requestAnimationFrame(() => {
                applyAnnotations(activeAnnotationsRef.current);
            });
        }
    }, [applyAnnotations]);

    const showTempSelection = useCallback((cfiRange, color = TEMP_SELECTION_COLOR) => {
        const rendition = renditionRef.current;
        if (!rendition?.annotations || !cfiRange) return;
        clearTempSelection(false);
        tempSelectionRef.current = { cfiRange };
        try {
            rendition.annotations.highlight(
                cfiRange,
                { temporary: true },
                () => {},
                'pt-reader-selection',
                {
                    fill: color,
                    'fill-opacity': '0.24',
                    'mix-blend-mode': 'multiply',
                },
            );
        } catch {
            tempSelectionRef.current = null;
        }
    }, [clearTempSelection]);

    useEffect(() => {
        let alive = true;
        refreshLibrary()
            .then((nextLibrary) => {
                if (!alive) return;
                setStatus(nextLibrary.books?.length ? '' : '书架还是空的，先导入一本 EPUB。');
            })
            .catch((err) => {
                if (!alive) return;
                setError(err.message || '读取书架失败。');
                setStatus('');
            });
        return () => { alive = false; };
    }, [refreshLibrary]);

    useEffect(() => {
        const bookToOpen = (libraryRef.current?.books || []).find((book) => book.id === activeBookId);
        const viewElement = viewRef.current;
        if (!bookToOpen || !viewElement) return undefined;

        let canceled = false;
        setStatus('正在打开电子书...');
        setError('');
        setSelection(null);
        setSelectionNote('');
        setBookDirection('ltr');
        setTocItems([]);
        setActiveTocHref('');
        setReadingProgress('');
        setReadingProgressValue(0);
        latestLocationRef.current = null;
        currentLocationRef.current = null;
        loadingReaderSettingsRef.current = true;
        setReaderSettings(normalizeReaderSettings(bookToOpen.readerSettings));

        renditionRef.current?.destroy?.();
        bookRef.current?.destroy?.();
        viewElement.innerHTML = '';

        const book = ePub(epubFileUrl(bookToOpen.id, bookToOpen.originalName), { openAs: 'epub' });
        bookRef.current = book;
        const rendition = book.renderTo(viewElement, {
            width: '100%',
            height: '100%',
            manager: 'continuous',
            flow: 'scrolled-doc',
            spread: 'none',
            allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        rendition.hooks.content.register((contents) => {
            const doc = contents?.document;
            if (!doc?.head) return;
            const style = doc.createElement('style');
            style.setAttribute('data-plantrace-reader', 'true');
            style.textContent = `
                html, body, .vrtl, .hltr, .main {
                    writing-mode: horizontal-tb !important;
                    -webkit-writing-mode: horizontal-tb !important;
                    direction: ltr !important;
                }
                body {
                    margin: 0 !important;
                    padding: 1.2em 1.6em !important;
                    overflow-wrap: break-word !important;
                    word-break: normal !important;
                    text-align: start !important;
                }
                p {
                    margin: 0.55em 0 !important;
                    text-align: start !important;
                }
                img, svg {
                    max-width: 100% !important;
                    height: auto !important;
                }
                html, body {
                    caret-color: #0f766e !important;
                    cursor: ${TEXT_CURSOR_CSS} !important;
                    overflow-anchor: none !important;
                    scroll-behavior: auto !important;
                    scrollbar-gutter: stable !important;
                    max-width: 100% !important;
                }
                html {
                    overflow-y: auto !important;
                    overflow-x: hidden !important;
                    height: auto !important;
                }
                body {
                    overflow: visible !important;
                    min-height: 100% !important;
                }
                ::selection {
                    background: rgba(0, 122, 255, 0.34) !important;
                    color: inherit !important;
                }
                ::-webkit-scrollbar {
                    width: 10px !important;
                    height: 10px !important;
                }
                ::-webkit-scrollbar-track {
                    background: transparent !important;
                }
                ::-webkit-scrollbar-thumb {
                    background: rgba(120, 120, 128, 0.32) !important;
                    border: 3px solid transparent !important;
                    border-radius: 999px !important;
                    background-clip: padding-box !important;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: rgba(120, 120, 128, 0.54) !important;
                    border: 2px solid transparent !important;
                    background-clip: padding-box !important;
                }
            `;
            doc.head.appendChild(style);

            const clearSelectionWhenBlank = () => {
                setTimeout(() => {
                    const text = String(doc.getSelection?.()?.toString() || '').trim();
                    if (!text) {
                        clearTempSelection();
                        setSelection(null);
                        setSelectionNote('');
                    }
                }, 20);
            };
            doc.addEventListener('mousedown', clearSelectionWhenBlank);
        });

        const settings = normalizeReaderSettings(bookToOpen.readerSettings);

        book.loaded.metadata.then((metadata) => {
            if (canceled) return;
            const patch = {};
            if (metadata?.title && metadata.title !== bookToOpen.title) patch.title = metadata.title;
            if (metadata?.creator && metadata.creator !== bookToOpen.author) patch.author = metadata.creator;
            if (Object.keys(patch).length) {
                updateEpubBook(bookToOpen.id, patch)
                    .then(setLibrary)
                    .catch(() => {});
            }
        }).catch(() => {});

        book.loaded.navigation.then((navigation) => {
            if (canceled) return;
            setTocItems(flattenToc(navigation?.toc || []));
        }).catch(() => {
            if (!canceled) setTocItems([]);
        });

        (async () => {
            await withTimeout(book.ready, DISPLAY_TIMEOUT_MS, 'EPUB 结构解析超时，可能是该文件的版式或资源不兼容。');
            if (canceled) return;

            const direction = getBookDirection(book);
            setBookDirection(direction);
            rendition.direction(direction);

            const target = getOpeningTarget(book, bookToOpen.lastLocation);
            try {
                await withTimeout(
                    rendition.display(target),
                    DISPLAY_TIMEOUT_MS,
                    'EPUB 页面渲染超时，已停止等待。可以尝试重新导入该书或换一个 EPUB 文件。',
                );
            } catch (displayError) {
                if (!target) throw displayError;
                await withTimeout(
                    rendition.display(),
                    DISPLAY_TIMEOUT_MS,
                    'EPUB 首页渲染失败，备用打开方式也未成功。',
                );
            }

            if (!canceled) {
                if (canceled) return;
                setStatus('');
                applyReaderSettings(settings);
                applyAnnotations(getBookAnnotations(libraryRef.current || {}, bookToOpen.id));
                book.locations.generate(1600).then(() => {
                    if (canceled || !renditionRef.current?.location) return;
                    const progress = getLocationProgress(renditionRef.current.location, book);
                    setReadingProgress(formatReadingProgress(progress));
                    setReadingProgressValue(progress);
                }).catch(() => {});
            }
        })().catch((err) => {
                if (canceled) return;
                setStatus('');
                setError(err.message || 'EPUB 打开失败。');
            });

        rendition.on('relocated', (location) => {
            currentLocationRef.current = location;
            const progress = getLocationProgress(location, book);
            setReadingProgress(formatReadingProgress(progress));
            setReadingProgressValue(progress);
            const currentHref = location?.start?.href || location?.end?.href || '';
            const nextTocHref = findActiveTocHref(tocItemsRef.current, currentHref);
            if (nextTocHref) {
                setActiveTocHref((current) => (current === nextTocHref ? current : nextTocHref));
            }
            const cfi = location?.start?.cfi;
            if (!cfi) return;
            latestLocationRef.current = { bookId: bookToOpen.id, cfi };
            clearTimeout(saveLocationTimerRef.current);
            saveLocationTimerRef.current = setTimeout(() => {
                updateEpubBook(bookToOpen.id, { lastLocation: cfi })
                    .then(setLibrary)
                    .catch(() => {});
            }, 650);
        });

        rendition.on('selected', (cfiRange, contents) => {
            const text = String(contents?.window?.getSelection?.()?.toString() || '').trim();
            if (!text) return;
            setSelection({ cfiRange, text });
            setSelectionNote('');
            showTempSelection(cfiRange);
            try { contents.window.getSelection().removeAllRanges(); } catch { /* ignore */ }
        });

        return () => {
            canceled = true;
            clearTimeout(saveLocationTimerRef.current);
            const latest = latestLocationRef.current;
            if (latest?.bookId === bookToOpen.id && latest.cfi) {
                updateEpubBook(bookToOpen.id, { lastLocation: latest.cfi }).catch(() => {});
            }
            rendition.destroy?.();
            book.destroy?.();
            viewElement.innerHTML = '';
            tempSelectionRef.current = null;
            currentLocationRef.current = null;
            navigatingRef.current = false;
        };
    }, [activeBookId, applyAnnotations, applyReaderSettings, clearTempSelection, showTempSelection]);

    useEffect(() => {
        applyReaderSettings(readerSettings);
        if (!activeBookId) return;
        if (loadingReaderSettingsRef.current) {
            loadingReaderSettingsRef.current = false;
            return;
        }

        updateEpubBook(activeBookId, { readerSettings })
            .then(setLibrary)
            .catch(() => {});
    }, [activeBookId, applyReaderSettings, readerSettings]);

    useEffect(() => {
        applyAnnotations(activeAnnotations);
    }, [activeAnnotations, applyAnnotations]);

    useEffect(() => {
        if (selection?.cfiRange) {
            showTempSelection(selection.cfiRange);
        }
    }, [selection, showTempSelection]);

    const displayAdjacentSpineSection = useCallback(async (spineDirection) => {
        const rendition = renditionRef.current;
        const book = bookRef.current;
        if (!rendition || !book) return false;

        const currentLocation = currentLocationRef.current || rendition.location;
        const currentIndex = getLocationSpineIndex(book, currentLocation);
        const target = findAdjacentReadableSpineItem(book, currentIndex, spineDirection);
        if (!target) return false;

        setStatus(spineDirection < 0 ? '正在返回上一章节...' : '正在进入下一章节...');
        await withTimeout(
            rendition.display(target.href),
            NAVIGATION_TIMEOUT_MS,
            '章节跳转超时。',
        );
        await wait(NAVIGATION_SETTLE_MS);
        scrollToSpineSection(rendition, target, spineDirection < 0 ? 'end' : 'start');
        await wait(80);
        await rendition.reportLocation?.();
        await wait(80);
        applyAnnotations(activeAnnotationsRef.current);
        setStatus('');
        return true;
    }, [applyAnnotations]);

    const navigateReader = useCallback(async (visualDirection) => {
        const rendition = renditionRef.current;
        if (!rendition || navigatingRef.current) return;

        const spineDirection = bookDirection === 'rtl' ? -visualDirection : visualDirection;
        const method = spineDirection < 0 ? 'prev' : 'next';
        navigatingRef.current = true;
        setError('');

        try {
            const before = getReaderNavigationSnapshot(rendition);
            await withTimeout(
                rendition[method]?.(),
                NAVIGATION_TIMEOUT_MS,
                method === 'prev' ? '上一页跳转超时。' : '下一页跳转超时。',
            );
            await wait(NAVIGATION_SETTLE_MS);
            const after = getReaderNavigationSnapshot(rendition);

            if (!didReaderMove(before, after)) {
                await displayAdjacentSpineSection(spineDirection);
            }
        } catch (err) {
            try {
                const recovered = await displayAdjacentSpineSection(spineDirection);
                if (!recovered) {
                    setError(err.message || '翻页失败。');
                }
            } catch (fallbackError) {
                setStatus('');
                setError(fallbackError.message || err.message || '翻页失败。');
            }
        } finally {
            navigatingRef.current = false;
        }
    }, [bookDirection, displayAdjacentSpineSection]);

    const goPreviousPage = useCallback(() => {
        navigateReader(-1);
    }, [navigateReader]);

    const goNextPage = useCallback(() => {
        navigateReader(1);
    }, [navigateReader]);

    useEffect(() => {
        const handler = (event) => {
            const tagName = event.target?.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
                if (event.key === 'Escape') onClose();
                return;
            }
            if (event.key === 'Escape') onClose();
            if (event.key === 'ArrowLeft') {
                goPreviousPage();
            }
            if (event.key === 'ArrowRight') {
                goNextPage();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [bookDirection, goNextPage, goPreviousPage, onClose]);

    const updateReaderSetting = (patch) => {
        setReaderSettings((current) => ({ ...current, ...patch }));
    };

    const handleImport = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setImporting(true);
        setError('');
        try {
            const result = await importEpubFile(file, activeShelfId === 'all' ? 'shelf_default' : activeShelfId);
            setLibrary(result.library);
            setActiveBookId(result.book.id);
            setStatus('');
        } catch (err) {
            setError(err.message || '导入 EPUB 失败。');
        } finally {
            setImporting(false);
        }
    };

    const handleCreateShelf = async () => {
        const name = newShelfName.trim();
        if (!name) return;
        setError('');
        try {
            const nextLibrary = await createEpubShelf(name);
            setLibrary(nextLibrary);
            const created = nextLibrary.shelves.find((shelf) => shelf.name === name);
            if (created) setActiveShelfId(created.id);
            setNewShelfName('');
        } catch (err) {
            setError(err.message || '创建书架失败。');
        }
    };

    const handleDeleteShelf = async (shelf) => {
        if (!shelf || shelf.id === DEFAULT_EPUB_SHELF_ID) return;
        const bookCount = (library.books || [])
            .filter((book) => getEpubBookShelfIds(book).includes(shelf.id))
            .length;
        const detail = bookCount > 0
            ? `这只会删除书架分类，不会删除其中 ${bookCount} 本书、EPUB 文件、批注或阅读进度。`
            : '这个书架里没有书，只会删除书架分类。';
        if (!window.confirm(`确定删除书架「${shelf.name}」吗？\n\n${detail}`)) {
            return;
        }

        setError('');
        try {
            const nextLibrary = await deleteEpubShelf(shelf.id);
            setLibrary(nextLibrary);
            setActiveShelfId((current) => (current === shelf.id ? 'all' : current));
        } catch (err) {
            setError(err.message || '删除书架失败。');
        }
    };

    const handleAddBookToShelf = async (book, shelfId) => {
        if (!book || !shelfId) return;
        const shelfIds = new Set(getEpubBookShelfIds(book));
        shelfIds.add(DEFAULT_EPUB_SHELF_ID);
        shelfIds.add(shelfId);
        setError('');
        try {
            const nextLibrary = await updateEpubBook(book.id, {
                shelfId: book.shelfId || DEFAULT_EPUB_SHELF_ID,
                shelfIds: [...shelfIds],
            });
            setLibrary(nextLibrary);
        } catch (err) {
            setError(err.message || '加入书架失败。');
        }
    };

    const handleRemoveBookFromShelf = async (book, shelfId) => {
        if (!book || !shelfId || shelfId === DEFAULT_EPUB_SHELF_ID) return;
        const shelfName = shelfById.get(shelfId)?.name || '这个书架';
        if (!window.confirm(`确定把《${getBookTitle(book)}》从「${shelfName}」移出吗？\n\n书籍文件、批注和默认书架里的记录都会保留。`)) {
            return;
        }

        const nextShelfIds = getEpubBookShelfIds(book)
            .filter((id) => id !== shelfId);
        if (!nextShelfIds.includes(DEFAULT_EPUB_SHELF_ID)) {
            nextShelfIds.unshift(DEFAULT_EPUB_SHELF_ID);
        }

        setError('');
        try {
            const nextLibrary = await updateEpubBook(book.id, {
                shelfId: book.shelfId === shelfId ? DEFAULT_EPUB_SHELF_ID : (book.shelfId || DEFAULT_EPUB_SHELF_ID),
                shelfIds: [...new Set(nextShelfIds)],
            });
            setLibrary(nextLibrary);
        } catch (err) {
            setError(err.message || '移出书架失败。');
        }
    };

    const handleSaveAnnotation = async ({ color = highlightColor, type = annotationType } = {}) => {
        if (!selection || !activeBook) return;
        setError('');
        try {
            const result = await saveEpubAnnotation({
                bookId: activeBook.id,
                cfiRange: selection.cfiRange,
                text: selection.text,
                note: selectionNote,
                color,
                type,
            });
            clearTempSelection();
            setLibrary(result.library);
            setSelection(null);
            setSelectionNote('');
            setHighlightColor(color);
            setAnnotationType(type);
        } catch (err) {
            setError(err.message || '保存标注失败。');
        }
    };

    const handleDeleteAnnotation = async (annotationId) => {
        try {
            const target = activeAnnotations.find((annotation) => annotation.id === annotationId);
            if (target?.cfiRange) {
                try { renditionRef.current?.annotations?.remove(target.cfiRange, getAnnotationRenderType(target)); } catch { /* ignore */ }
            }
            const nextLibrary = await deleteEpubAnnotation(annotationId);
            setLibrary(nextLibrary);
        } catch (err) {
            setError(err.message || '删除标注失败。');
        }
    };

    const handleImportSelectionToDiary = async () => {
        if (!selection || !activeBook) return;
        const today = getTodayBJ();
        const currentDiary = await readDiary(null, today);
        const diary = currentDiary || createEmptyDiary();
        const noteText = [
            `《${getBookTitle(activeBook)}》`,
            `原文：${selection.text}`,
            selectionNote.trim() ? `我的评论：${selectionNote.trim()}` : '',
        ].filter(Boolean).join('\n');
        const note = {
            id: noteId(),
            text: noteText,
            color: 'sky',
            createdAt: Date.now(),
        };
        await writeDiary(null, today, {
            ...diary,
            notes: [note, ...(diary.notes || [])],
        });
        setStatus('已导入今天的碎碎念。');
        setTimeout(() => setStatus(''), 1800);
    };

    const cancelSelection = () => {
        clearTempSelection();
        setSelection(null);
        setSelectionNote('');
    };

    const jumpToToc = async (href) => {
        if (!href || !renditionRef.current) return;
        setStatus('正在跳转目录...');
        setError('');
        try {
            await withTimeout(
                renditionRef.current.display(href),
                DISPLAY_TIMEOUT_MS,
                '目录跳转超时。',
            );
            setActiveTocHref(href);
            setStatus('');
        } catch (err) {
            setStatus('');
            setError(err.message || '目录跳转失败。');
        }
    };

    return (
        <div className="reader-overlay">
            <aside className="reader-sidebar">
                <div className="reader-sidebar-head">
                    <div className="reader-sidebar-title">
                        <Library size={17} />
                        <span>本地阅读器</span>
                    </div>
                    <button className="reader-icon-btn" onClick={onClose} title="退出阅读器">
                        <X size={17} />
                    </button>
                </div>

                <div className="reader-import-box">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".epub,application/epub+zip"
                        className="hidden"
                        onChange={handleImport}
                    />
                    <button
                        className="reader-primary-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing}
                    >
                        <Upload size={15} />
                        {importing ? '导入中...' : '导入 EPUB'}
                    </button>
                    <div className="reader-shelf-create">
                        <input
                            value={newShelfName}
                            onChange={(event) => setNewShelfName(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') handleCreateShelf(); }}
                            placeholder="新书架名称"
                        />
                        <button onClick={handleCreateShelf} title="新建书架">
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                <div className="reader-shelf-tabs">
                    <button
                        className={`reader-shelf-name ${activeShelfId === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveShelfId('all')}
                    >
                        全部
                    </button>
                    {(library.shelves || []).map((shelf) => (
                        <div
                            key={shelf.id}
                            className={`reader-shelf-tab ${activeShelfId === shelf.id ? 'active' : ''}`}
                        >
                            <button
                                type="button"
                                className="reader-shelf-name"
                                onClick={() => setActiveShelfId(shelf.id)}
                                title={shelf.name}
                            >
                                {shelf.name}
                            </button>
                            {shelf.id !== DEFAULT_EPUB_SHELF_ID && (
                                <button
                                    type="button"
                                    className="reader-shelf-delete"
                                    onClick={() => handleDeleteShelf(shelf)}
                                    title={`删除书架「${shelf.name}」`}
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <div className="reader-book-list">
                    {activeShelfBooks.length === 0 ? (
                        <div className="reader-empty">这个书架还没有书。</div>
                    ) : activeShelfBooks.map((book) => {
                        const bookShelfIds = getEpubBookShelfIds(book);
                        const assignedCustomShelves = customShelves.filter((shelf) => bookShelfIds.includes(shelf.id));
                        const availableShelves = customShelves.filter((shelf) => !bookShelfIds.includes(shelf.id));
                        return (
                            <div
                                key={book.id}
                                className={`reader-book-item ${book.id === activeBookId ? 'active' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => setActiveBookId(book.id)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setActiveBookId(book.id);
                                    }
                                }}
                            >
                                <BookOpen size={15} />
                                <div className="reader-book-body">
                                    <div className="reader-book-meta">
                                        <strong>{getBookTitle(book)}</strong>
                                        <small>{book.author || book.originalName || '本地 EPUB'}</small>
                                    </div>
                                    <div
                                        className="reader-book-shelves"
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => event.stopPropagation()}
                                    >
                                        <span className="reader-book-chip is-default">默认</span>
                                        {assignedCustomShelves.map((shelf) => (
                                            <span className="reader-book-chip" key={shelf.id}>
                                                {shelf.name}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveBookFromShelf(book, shelf.id)}
                                                    title={`从「${shelf.name}」移出`}
                                                >
                                                    <X size={10} />
                                                </button>
                                            </span>
                                        ))}
                                        {availableShelves.length > 0 && (
                                            <select
                                                className="reader-book-shelf-select"
                                                value=""
                                                onChange={(event) => {
                                                    const shelfId = event.target.value;
                                                    event.target.value = '';
                                                    handleAddBookToShelf(book, shelfId);
                                                }}
                                                title="加入其他书架"
                                            >
                                                <option value="">加入书架</option>
                                                {availableShelves.map((shelf) => (
                                                    <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="reader-toc-panel">
                    <div className="reader-toc-title">
                        <ListTree size={14} />
                        <span>目录</span>
                    </div>
                    <div className="reader-toc-list">
                        {tocItems.length === 0 ? (
                            <div className="reader-empty">这本书没有可读取目录。</div>
                        ) : tocItems.map((item, index) => (
                            <button
                                key={`${item.href}-${index}`}
                                ref={(node) => {
                                    if (node) tocItemRefs.current.set(item.href, node);
                                    else tocItemRefs.current.delete(item.href);
                                }}
                                className={`reader-toc-item ${item.href === activeTocHref ? 'active' : ''}`}
                                aria-current={item.href === activeTocHref ? 'true' : undefined}
                                style={{ paddingLeft: `${10 + item.level * 12}px` }}
                                onClick={() => jumpToToc(item.href)}
                                title={item.label}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            </aside>

            <main className="reader-main">
                <div className="reader-topbar">
                    <div className="reader-book-heading">
                        <strong>{activeBook ? getBookTitle(activeBook) : '选择一本书开始阅读'}</strong>
                        <span>{activeBook?.author || 'EPUB 阅读、标注和摘录'}</span>
                    </div>
                    <div className="reader-progress" aria-label={`阅读进度 ${readingProgress || '0%'}`}>
                        <div className="reader-progress-meta">
                            <span>阅读进度</span>
                            <strong>{activeBook ? (readingProgress || '0%') : '-'}</strong>
                        </div>
                        <div className="reader-progress-track">
                            <div
                                className="reader-progress-fill"
                                style={{ width: `${Math.round(readingProgressValue * 100)}%` }}
                            />
                        </div>
                    </div>
                    <div className="reader-topbar-actions">
                        <TextExperienceControls
                            dense
                            fontSize={readerSettings.fontSize}
                            lineHeight={readerSettings.lineHeight}
                            surface={readerSettings.surface}
                            onFontSize={(value) => updateReaderSetting({ fontSize: value })}
                            onLineHeight={(value) => updateReaderSetting({ lineHeight: value })}
                            onSurface={(value) => updateReaderSetting({ surface: value })}
                        />
                    </div>
                </div>

                {(status || error) && (
                    <div className={`reader-toast ${error ? 'error' : ''}`}>{error || status}</div>
                )}

                <section
                    className="reader-stage"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) cancelSelection();
                    }}
                >
                    <button className="reader-page-btn reader-page-prev" onClick={goPreviousPage} title="上一页">
                        <ArrowLeft size={18} />
                    </button>
                    <div
                        ref={viewRef}
                        className="reader-view"
                        style={{ background: surface.background, color: surface.color }}
                    />
                    <button className="reader-page-btn reader-page-next" onClick={goNextPage} title="下一页">
                        <ArrowRight size={18} />
                    </button>
                    {!activeBook && (
                        <div className="reader-start-panel">
                            <Library size={28} />
                            <strong>把本地 EPUB 放进 PlanTrace</strong>
                            <span>书籍保存到 data/epub/books，书架和批注保存到 data/epub/library.json。</span>
                        </div>
                    )}
                </section>
            </main>

            <aside className={`reader-notes-panel ${selection ? 'has-selection' : ''}`}>
                <div className="reader-panel-title">
                    <Highlighter size={15} />
                    <span>标注与摘录</span>
                </div>

                {selection && (
                    <div className="reader-selection-card">
                        <div className="reader-selection-quote">
                            <Quote size={14} />
                            <p>{selection.text}</p>
                        </div>
                        <div className="reader-mark-type">
                            <button
                                className={annotationType === 'highlight' ? 'active' : ''}
                                onClick={() => setAnnotationType('highlight')}
                            >
                                <Highlighter size={13} /> 填充
                            </button>
                            <button
                                className={annotationType === 'textColor' ? 'active' : ''}
                                onClick={() => setAnnotationType('textColor')}
                            >
                                <Type size={13} /> 字体
                            </button>
                            <button
                                className={annotationType === 'underline' ? 'active' : ''}
                                onClick={() => setAnnotationType('underline')}
                            >
                                <Underline size={13} /> 下划线
                            </button>
                        </div>
                        <div className="reader-quick-mark-row">
                            <div className="reader-highlight-colors">
                                {HIGHLIGHT_COLORS.map((item) => (
                                    <button
                                        key={item.id}
                                        className={highlightColor === item.value ? 'active' : ''}
                                        style={{ background: item.value }}
                                        title={`${item.label}：点击即保存当前标注`}
                                        onClick={() => handleSaveAnnotation({ color: item.value, type: annotationType })}
                                    />
                                ))}
                            </div>
                            <button onClick={cancelSelection}>
                                <X size={14} /> 取消
                            </button>
                        </div>
                    </div>
                )}

                <div className={`reader-annotation-list ${!selection && activeAnnotations.length === 0 ? 'is-empty' : ''}`}>
                    {!selection && activeAnnotations.length === 0 ? (
                        <div className="reader-empty">选中文字后可保存标注、笔记，或导入今天的碎碎念。</div>
                    ) : activeAnnotations.map((annotation) => (
                        <div className="reader-annotation-item" key={annotation.id}>
                            <div
                                className={`reader-annotation-mark ${getAnnotationType(annotation)}`}
                                style={{
                                    background: getAnnotationType(annotation) === 'underline' ? 'transparent' : annotation.color,
                                    borderColor: annotation.color,
                                }}
                            />
                            <p>{annotation.text}</p>
                            {annotation.note && <small>{annotation.note}</small>}
                            <button onClick={() => handleDeleteAnnotation(annotation.id)} title="删除标注">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                </div>

                {selection && (
                    <div className="reader-diary-dock">
                        <div className="reader-diary-dock-head">
                            <span>碎碎念摘录</span>
                            <small>原文 + 我的评论</small>
                        </div>
                        <textarea
                            className="reader-comment-input"
                            value={selectionNote}
                            onChange={(event) => setSelectionNote(event.target.value)}
                            placeholder="我的评论..."
                            rows={3}
                        />
                        <button
                            className="reader-diary-action"
                            onClick={handleImportSelectionToDiary}
                            title="把原文和评论导入今天的碎碎念"
                        >
                            <Plus size={13} /> 碎碎念
                        </button>
                    </div>
                )}
            </aside>
        </div>
    );
}
