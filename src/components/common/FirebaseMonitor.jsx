import React from 'react';
import { useData } from '../../contexts/DataContext';
import { DISABLE_FIRESTORE } from '../../firebase/config';
import { Activity, RefreshCw } from 'lucide-react';

export default function FirebaseMonitor() {
    const { totalReads, resetReads } = useData();

    return (
        <div className="fixed bottom-4 right-4 bg-white/90 backdrop-blur border border-gray-200 shadow-xl rounded-lg p-3 z-50 flex items-center gap-3 animate-fade-in transition-all hover:bg-white text-sm">
            <div className={`p-2 rounded-full ${DISABLE_FIRESTORE ? 'bg-purple-100 text-purple-600' : (totalReads > 100 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600')}`}>
                <Activity size={16} />
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                    {DISABLE_FIRESTORE ? 'Simulated Reads' : 'Session Reads'}
                </span>
                <span className={`font-bold tabular-nums ${totalReads > 300 ? 'text-red-600' : 'text-gray-900'}`}>
                    {totalReads.toLocaleString()} docs
                </span>
            </div>
            <button
                onClick={resetReads}
                className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
                title="Reset Counter"
            >
                <RefreshCw size={14} />
            </button>
        </div>
    );
}
