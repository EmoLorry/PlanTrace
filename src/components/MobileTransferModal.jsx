import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, Smartphone, Upload, X } from 'lucide-react';
import {
    createMobileTransferPackage,
    downloadMobileTransferPackage,
    importMobileTransferFile,
} from '../store/mobileTransfer.js';
import { createQrSvg } from '../utils/qrLite.js';

const FRAME_MS = 100;

export default function MobileTransferModal({ onClose }) {
    const [transfer, setTransfer] = useState(null);
    const [frameIndex, setFrameIndex] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [error, setError] = useState('');
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        let alive = true;
        createMobileTransferPackage()
            .then((pkg) => {
                if (!alive) return;
                setTransfer(pkg);
                setFrameIndex(0);
            })
            .catch((err) => {
                if (alive) setError(err.message || 'Failed to create mobile package.');
            });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (!playing || !transfer?.frames?.length) return undefined;
        const timer = setInterval(() => {
            setFrameIndex((current) => (current + 1) % transfer.frames.length);
        }, FRAME_MS);
        return () => clearInterval(timer);
    }, [playing, transfer]);

    const currentFrame = transfer?.frames?.[frameIndex] || '';
    const qrSvg = useMemo(() => (
        currentFrame ? createQrSvg(currentFrame, { moduleSize: 8, quiet: 4 }) : ''
    ), [currentFrame]);

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setImporting(true);
        setError('');
        try {
            const stats = await importMobileTransferFile(file);
            const taskCount = stats.tasks.imported + stats.tasks.replaced;
            const logCount = stats.logs.imported + stats.logs.replaced;
            const diaryCount = stats.diaries.imported + stats.diaries.replaced;
            alert(`已合并手机端 JSON 数据。\n任务：${taskCount}\n日志：${logCount}\n日记：${diaryCount}\n\nPlanTrace 将刷新以载入合并后的数据。`);
            window.location.reload();
        } catch (err) {
            setError(err.message || 'Failed to import mobile data.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="w-[460px] max-w-[calc(100vw-32px)] rounded-2xl bg-white/95 shadow-2xl border border-white/70 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                            <Smartphone size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">Mobile Sync</h2>
                            <p className="text-xs text-slate-500">电脑 ↔ 手机离线数据包</p>
                        </div>
                    </div>
                    <button className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {!transfer && !error && (
                        <div className="h-[340px] flex items-center justify-center text-sm text-slate-500">
                            正在生成手机端传输包...
                        </div>
                    )}

                    {error && (
                        <div className="h-[340px] flex items-center justify-center text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    {transfer && (
                        <>
                            <div className="flex gap-4">
                                <div className="w-[260px] h-[260px] shrink-0 rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
                                    <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                                </div>
                                <div className="min-w-0 flex-1 space-y-3 text-xs text-slate-600">
                                    <div>
                                        <div className="font-semibold text-slate-900 mb-1">手机端导入</div>
                                        <p>在手机打开项目里的 <span className="font-mono">mobile.html</span>，选择「扫描视频二维码」，对准这里即可。</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1">
                                        <div>帧数：{frameIndex + 1} / {transfer.total}</div>
                                        <div>原始：{Math.round(transfer.byteLength / 1024)} KB</div>
                                        <div>编码：{Math.round(transfer.encodedLength / 1024)} KB</div>
                                        <div>压缩：{transfer.compressed ? 'gzip' : 'raw'}</div>
                                    </div>
                                    <p className="text-slate-400">手机端或微信小程序导出的 JSON 可在这里导回电脑端，按 id 合并，不整库覆盖。</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <div className="text-xs text-slate-400">
                                    二维码用于电脑到手机；JSON 导入用于手机回到电脑。
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/json,.json"
                                        className="hidden"
                                        onChange={handleImportFile}
                                    />
                                    <button
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium disabled:opacity-60"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={importing}
                                    >
                                        <Upload size={14} />
                                        {importing ? '合并中' : '合并手机/小程序 JSON'}
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-medium"
                                        onClick={() => setPlaying((value) => !value)}
                                    >
                                        {playing ? <Pause size={14} /> : <Play size={14} />}
                                        {playing ? '暂停' : '播放'}
                                    </button>
                                    <button
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-xs font-medium"
                                        onClick={() => downloadMobileTransferPackage(transfer)}
                                    >
                                        <Download size={14} />
                                        JSON
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
