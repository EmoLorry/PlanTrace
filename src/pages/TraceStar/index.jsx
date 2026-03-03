import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TraceStar() {
    const navigate = useNavigate();
    return (
        <div className="h-full w-full flex flex-col items-center justify-center relative animate-in fade-in duration-700 bg-surface">
            <button
                onClick={() => navigate('/')}
                className="absolute top-6 left-8 p-2 pr-4 rounded-xl text-text-muted hover:text-text-primary hover:bg-black/5 transition-all flex items-center gap-2"
            >
                <ArrowLeft size={18} />
                <span className="font-medium">Back</span>
            </button>

            <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-sm">
                    TraceStar
                </h1>
                <p className="text-text-muted text-lg font-medium tracking-wide">
                    Connect the dots, form a constellation.
                </p>
                <div className="mt-8 p-8 rounded-2xl bg-surface/50 border border-divider shadow-inner backdrop-blur-md">
                    <p className="text-text-muted">Global Application Sandbox (Under Construction)</p>
                    <div className="mt-4 flex gap-2 justify-center">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="w-3 h-3 rounded-full bg-accent/40 animate-pulse"
                                style={{ animationDelay: `${i * 150}ms` }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
