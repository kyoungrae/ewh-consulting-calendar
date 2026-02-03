import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useSchedules, useCommonCodes, useUsers } from '../../hooks/useFirestore';
import * as XLSX from 'xlsx';
import {
    Plus,
    Edit2,
    Trash2,
    Calendar,
    Clock,
    MapPin,
    Upload,
    FileText,
    Loader2,
    Filter,
    ChevronLeft,
    ChevronRight,
    ArrowUp,
    AlertCircle,
} from 'lucide-react';

// 날짜 포맷팅 유틸리티
// 날짜 포맷팅 유틸리티
const formatters = {
    fullDate: (iso) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
    time: (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    timestamp: (iso) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    scheduleDate: (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
    }
};

// 변경 이력 아이템 컴포넌트 (개선된 UI)
function LogItem({ log, index }) {
    const [isExpanded, setIsExpanded] = useState(index === 0);
    const [subExpanded, setSubExpanded] = useState({
        added: true,
        deleted: true,
        warning: true
    });

    const summary = log.summary || { added: 0, updated: 0, deleted: 0 };
    const details = log.details || { added: [], updated: [], deleted: [] };
    const totalChanges = (summary.added || 0) + (summary.updated || 0) + (summary.deleted || 0);

    const toggleSub = (key) => {
        setSubExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // 도움말: 변경 데이터 비교 렌더링
    const renderComparison = (beforeVal, afterVal, formatter = (v) => v, isOrange = false) => {
        const noneSpan = <span className="text-gray-300 italic text-[11px]">(없음)</span>;
        const b = formatter(beforeVal);
        const a = formatter(afterVal);

        const bDisplay = b ? b : noneSpan;
        const aDisplay = a ? a : noneSpan;

        if (b === a) {
            return <span className={isOrange ? 'text-amber-800' : 'text-gray-800'}>{a ? a : noneSpan}</span>;
        }

        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-gray-400 line-through text-[11px] font-normal">{bDisplay}</span>
                <span className={isOrange ? 'text-amber-500' : 'text-emerald-500'}>→</span>
                <span className={`${isOrange ? 'text-amber-900' : 'text-emerald-900'} font-bold`}>{aDisplay}</span>
            </div>
        );
    };

    // Safe access to added/updated items
    const rawAddedItems = details.added || [];
    const rawUpdatedItems = details.updated || []; // { before, after } 객체 쌍 유지

    // 정상 처리 항목들 분리
    const addedItems = rawAddedItems.filter(s => s && !s.consultantId?.startsWith('unknown_') && s.typeName !== s.typeCode);
    const updatedItems = rawUpdatedItems.filter(u => u.after && !u.after.consultantId?.startsWith('unknown_') && u.after.typeName !== u.after.typeCode);

    // 정보 확인 필요 (경고) 항목들 - { before, after, isAdded } 구조로 통일
    const warningSchedules = [
        ...rawAddedItems.map(s => ({ after: s, isAdded: true })),
        ...rawUpdatedItems.map(u => ({ before: u.before, after: u.after, isAdded: false }))
    ].filter(item => {
        const s = item.after;
        return s && (s.consultantId?.startsWith('unknown_') || s.typeName === s.typeCode);
    });

    return (
        <div className={`group border transition-all duration-200 rounded-xl bg-white overflow-hidden mb-8 ${isExpanded ? 'border-[#00462A] shadow-md ring-1 ring-[#00462A]/10' : 'border-gray-200 shadow-sm hover:border-gray-300'}`} style={{ padding: "10px" }}>
            {/* Header */}
            <div
                style={{ padding: "5px" }}
                className={`flex items-center justify-between p-5 cursor-pointer select-none ${isExpanded ? 'bg-gray-50/50' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* ... (Header Content) */}
                <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isExpanded ? 'bg-[#00462A] text-white shadow-lg shadow-[#00462A]/20' : 'bg-gray-100 text-gray-500 group-hover:bg-[#00462A]/10 group-hover:text-[#00462A]'}`}>
                        <FileText size={20} className={isExpanded ? 'scale-110' : ''} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-gray-900 text-lg">
                                {log.type === 'MERGE' || log.type === 'REPLACE' ? '엑셀 일정 업로드' :
                                    log.type === 'ADD' ? '일정 직접 추가' :
                                        log.type === 'UPDATE' ? '일정 내용 수정' :
                                            log.type === 'DELETE' ? '일정 삭제' : '시스템 변경'}
                            </h3>
                            {index === 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold tracking-tight" style={{ padding: "5px" }}>NEW</span>}
                        </div>
                        <p className="text-sm text-gray-500 font-medium">{formatters.timestamp(log.timestamp)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex gap-2">
                        {summary.added > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1.5" style={{ padding: "10px" }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                추가 (+{summary.added})
                            </div>
                        )}
                        {summary.updated > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold flex items-center gap-1.5" style={{ padding: "10px" }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                {summary.updated} 수정
                            </div>
                        )}
                        {summary.deleted > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5" style={{ padding: "10px" }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                삭제 (-{summary.deleted})
                            </div>
                        )}
                        {warningSchedules.length > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-orange-100 border border-orange-200 text-orange-700 text-xs font-bold flex items-center gap-1.5" style={{ padding: "10px" }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                정보 확인 필요 ({warningSchedules.length})
                            </div>
                        )}
                        {totalChanges === 0 && (
                            <span className="text-sm text-gray-400 font-medium bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">변경사항 없음</span>
                        )}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isExpanded ? 'bg-gray-200 rotate-180 text-gray-800' : 'bg-transparent text-gray-400 group-hover:bg-gray-100'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            </div>

            {/* Details Content */}
            {isExpanded && totalChanges > 0 && (
                <div className="border-t border-gray-100 bg-white animate-fade-in divide-y divide-gray-100">

                    {/* 1. 새로 추가된 일정 (Green) */}
                    {addedItems.length > 0 && (
                        <div className="bg-emerald-50/5 overflow-hidden">
                            <button
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleSub('added')}
                                className="w-full flex items-center justify-between p-4 px-6 hover:bg-emerald-50/30 transition-colors group/sub"
                            >
                                <div className="flex items-center gap-2.5 text-sm font-bold text-emerald-800" style={{ padding: "10px" }}>
                                    <div className={`transition-transform duration-200 ${subExpanded.added ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={18} className="text-emerald-400" />
                                    </div>
                                    <div className="p-1 rounded bg-emerald-100 text-emerald-600"><Plus size={14} strokeWidth={3} /></div>
                                    새로 추가된 일정 <span className="text-emerald-600 text-xs bg-emerald-50 px-2 py-0.5 rounded-full ml-1 font-bold border border-emerald-100" style={{ padding: "5px" }}>신규 ({addedItems.length})</span>
                                </div>
                            </button>

                            {subExpanded.added && (
                                <div className="p-6 pt-0" style={{ padding: "10px", paddingTop: "0" }}>
                                    <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-emerald-50/30">
                                        <table className="w-full text-sm">
                                            <thead className="bg-emerald-50/80 text-xs text-emerald-600 uppercase font-semibold border-b border-emerald-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#059669', padding: "10px" }}>일자</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#059669', padding: "10px" }}>시간</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#059669', padding: "10px" }}>구분</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#059669', padding: "10px" }}>담당</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#059669', padding: "10px" }}>장소</th>
                                                    <th className="px-6 py-4 text-left" style={{ color: '#059669', padding: "10px" }}>상태</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-emerald-100 bg-white">
                                                {addedItems.map((s, i) => (
                                                    <tr key={i} className="hover:bg-emerald-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-emerald-900 whitespace-nowrap" style={{ padding: "10px" }}>{formatters.scheduleDate(s.date)}</td>
                                                        <td className="px-6 py-4 text-emerald-600/70 whitespace-nowrap" style={{ padding: "10px" }}>{formatters.time(s.date)}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                                {s.typeName}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 font-medium text-emerald-900 whitespace-nowrap" style={{ padding: "10px" }}>{s.consultantName}</td>
                                                        <td className="px-6 py-4 text-emerald-600/70 whitespace-nowrap" style={{ padding: "10px" }}>{s.location || <span className="text-gray-300 italic text-[11px]">(없음)</span>}</td>
                                                        <td className="px-6 py-4 text-emerald-600 text-xs font-semibold" style={{ color: '#059669', padding: "10px" }}>정상 등록</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2. 수정된 일정 (Amber/Orange) */}
                    {updatedItems.length > 0 && (
                        <div className="bg-amber-50/5 overflow-hidden">
                            <button
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleSub('updated')}
                                className="w-full flex items-center justify-between p-4 px-6 hover:bg-amber-50/30 transition-colors group/sub"
                            >
                                <div className="flex items-center gap-2.5 text-sm font-bold text-amber-800" style={{ padding: "10px" }}>
                                    <div className={`transition-transform duration-200 ${subExpanded.updated ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={18} className="text-amber-400" />
                                    </div>
                                    <div className="p-1 rounded bg-amber-100 text-amber-600"><Edit2 size={14} strokeWidth={3} /></div>
                                    변경된 일정 <span className="text-amber-600 text-xs bg-amber-50 px-2 py-0.5 rounded-full ml-1 font-bold border border-amber-100" style={{ padding: "5px" }}>수정됨 ({updatedItems.length})</span>
                                </div>
                            </button>

                            {subExpanded.updated && (
                                <div className="p-6 pt-0" style={{ padding: "10px", paddingTop: "0" }}>
                                    <div className="overflow-x-auto rounded-xl border border-amber-100 bg-amber-50/30">
                                        <table className="w-full text-sm">
                                            <thead className="bg-amber-50/80 text-xs text-amber-600 uppercase font-semibold border-b border-amber-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#d97706', padding: "10px" }}>일자</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#d97706', padding: "10px" }}>시간</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#d97706', padding: "10px" }}>구분</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#d97706', padding: "10px" }}>담당</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ color: '#d97706', padding: "10px" }}>장소</th>
                                                    <th className="px-6 py-4 text-left" style={{ color: '#d97706', padding: "10px" }}>상태</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-amber-100 bg-white">
                                                {updatedItems.map((u, i) => {
                                                    const { before, after } = u;

                                                    return (
                                                        <tr key={i} className="hover:bg-amber-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-medium whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {renderComparison(before.date, after.date, formatters.scheduleDate, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {renderComparison(before.date, after.date, formatters.time, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {renderComparison(before.typeName, after.typeName, undefined, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {renderComparison(before.consultantName, after.consultantName, undefined, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {renderComparison(before.location, after.location, undefined, true)}
                                                            </td>
                                                            <td className="px-6 py-4 text-amber-600 text-xs font-semibold" style={{ color: '#d97706', padding: "10px" }}>수정됨</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2. 삭제된 일정 (Red) */}
                    {details?.deleted?.length > 0 && (
                        <div className="bg-rose-50/5 overflow-hidden">
                            <button
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleSub('deleted')}
                                className="w-full flex items-center justify-between p-4 px-6 hover:bg-rose-50/30 transition-colors group/sub"
                            >
                                <div className="flex items-center gap-2.5 text-sm font-bold text-rose-600" style={{ padding: "10px" }}>
                                    <div className={`transition-transform duration-200 ${subExpanded.deleted ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={18} className="text-rose-400" />
                                    </div>
                                    <div className="p-1 rounded bg-rose-100 text-rose-600"><Trash2 size={14} strokeWidth={3} /></div>
                                    삭제된 일정 <span className="text-rose-600 text-xs bg-rose-50 px-2 py-0.5 rounded-full ml-1 font-bold border border-rose-100" style={{ padding: "5px" }}>{details.deleted.length}건</span>
                                </div>
                            </button>

                            {subExpanded.deleted && (
                                <div className="p-6 pt-0" style={{ padding: "10px", paddingTop: "0" }}>
                                    <div className="overflow-x-auto rounded-xl border border-rose-100 bg-rose-50/30">
                                        <table className="w-full text-sm">
                                            <thead className="bg-rose-50/80 text-xs text-rose-600 uppercase font-semibold border-b border-rose-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>일자</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>시간</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>구분</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>담당</th>
                                                    <th className="px-6 py-4 text-left" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>사유</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-rose-100 bg-white">
                                                {details.deleted.map((s, i) => (
                                                    <tr key={i} className="hover:bg-rose-50/50 transition-colors group">
                                                        <td className="px-6 py-4 font-medium text-rose-800 line-through whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>{formatters.scheduleDate(s.date)}</td>
                                                        <td className="px-6 py-4 text-rose-600/70 line-through whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>{formatters.time(s.date)}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>
                                                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-600 border border-rose-100 line-through">
                                                                {s.typeName || s.typeCode}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-gray-600 line-through whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-rose-600) 70%, transparent)', }}>{s.consultantName}</td>
                                                        <td className="px-6 py-4 text-rose-400 text-xs italic line-through" style={{ padding: "10px" }}>엑셀 명단에 없음</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. 일정은 추가되었지만 추가되지 않은 데이터 존재 (Orange) */}
                    {warningSchedules.length > 0 && (
                        <div className="bg-orange-50/5 overflow-hidden">
                            <button
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleSub('warning')}
                                className="w-full flex items-center justify-between p-4 px-6 hover:bg-orange-50/30 transition-colors group/sub"
                            >
                                <div className="flex items-center gap-2.5 text-sm font-bold text-orange-600" style={{ padding: "10px" }}>
                                    <div className={`transition-transform duration-200 ${subExpanded.warning ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={18} className="text-orange-400" />
                                    </div>
                                    <div className="p-1 rounded bg-orange-100 text-orange-600"><AlertCircle size={14} strokeWidth={3} /></div>
                                    일정은 추가되었지만 추가되지 않은 데이터 존재 <span className="text-orange-600 text-xs bg-orange-50 px-2 py-0.5 rounded-full ml-1 font-bold border border-orange-200" style={{ padding: "5px" }}>확인 필요 ({warningSchedules.length})</span>
                                </div>
                            </button>

                            {subExpanded.warning && (
                                <div className="p-6 pt-0" style={{ padding: "10px", paddingTop: "0" }}>
                                    <div className="overflow-x-auto rounded-xl border border-orange-200 bg-orange-50/30">
                                        <table className="w-full text-sm">
                                            <thead className="bg-orange-50/80 text-xs text-orange-600 uppercase font-semibold border-b border-orange-200">
                                                <tr>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-orange-600) 70%, transparent)', }}>일자</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-orange-600) 70%, transparent)', }}>시간</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-orange-600) 70%, transparent)', }}>구분</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-orange-600) 70%, transparent)', }}>담당</th>
                                                    <th className="px-6 py-4 text-left whitespace-nowrap" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-orange-600) 70%, transparent)', }}>장소</th>
                                                    <th className="px-6 py-4 text-left" style={{ padding: "10px", color: 'color-mix(in oklab, var(--color-orange-600) 70%, transparent)', }}>사유</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-orange-100 bg-white">
                                                {warningSchedules.map((item, i) => {
                                                    const s = item.after;
                                                    const b = item.before;
                                                    const isAdded = item.isAdded;
                                                    const isMissingUser = s.consultantId?.startsWith('unknown_');
                                                    const isMissingType = s.typeName === s.typeCode;

                                                    return (
                                                        <tr key={i} className="hover:bg-orange-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-medium whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {isAdded ? formatters.scheduleDate(s.date) : renderComparison(b.date, s.date, formatters.scheduleDate, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {isAdded ? formatters.time(s.date) : renderComparison(b.date, s.date, formatters.time, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {isAdded ? (
                                                                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-medium border ${isMissingType ? 'bg-orange-50/50 text-gray-400 border-gray-100 italic' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                                                        {s.typeName}
                                                                    </span>
                                                                ) : renderComparison(b.typeName, s.typeName, undefined, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {isAdded ? (
                                                                    <span className={isMissingUser ? 'text-gray-400 italic' : 'text-orange-700'}>{s.consultantName}</span>
                                                                ) : renderComparison(b.consultantName, s.consultantName, undefined, true)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                                {isAdded ? (s.location || <span className="text-gray-300 italic">(없음)</span>) : renderComparison(b.location, s.location, undefined, true)}
                                                            </td>
                                                            <td className="px-6 py-4 text-orange-600 text-[11px] font-semibold italic" style={{ padding: "10px" }}>
                                                                {isMissingUser && isMissingType ? '미등록 상담사 및 유형' : isMissingUser ? '미등록 상담사' : '미등록 유형'}
                                                                {!isAdded && <span className="ml-1 text-orange-400 font-bold">(내용 수정됨)</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function SchedulesPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState('list'); // 'list' | 'log'
    const fileInputRef = useRef(null);
    const { openSidebar } = useOutletContext();

    const {
        schedules,
        loading: schedulesLoading,
        changeLog,
        addSchedule,
        updateSchedule,
        deleteSchedule,
        batchAddSchedules,
        mergeSchedules,
        clearAllSchedules,
        clearChangeLog
    } = useSchedules();
    const { codes, loading: codesLoading } = useCommonCodes();
    const { users, loading: usersLoading } = useUsers();

    // 스크롤 맨 위로 버튼 상태
    const [showScrollTop, setShowScrollTop] = useState(false);

    // 스크롤 이벤트 감지
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 300) {
                setShowScrollTop(true);
            } else {
                setShowScrollTop(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // 맨 위로 스크롤
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    const loading = schedulesLoading || codesLoading || usersLoading;

    // --- 페이지네이션 및 필터 상태 ---
    // 초기값을 'all'로 설정하여 전체 데이터 표시
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState('all');
    const [selectedMonth, setSelectedMonth] = useState('all');

    const [selectedDay, setSelectedDay] = useState('all');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedConsultant, setSelectedConsultant] = useState('all');
    const [searchLocation, setSearchLocation] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const { fetchMonthSchedules } = useSchedules();

    // 년/월 선택 시 데이터 로드 트리거
    useEffect(() => {
        if (selectedYear !== 'all' && selectedMonth !== 'all') {
            const y = parseInt(selectedYear);
            const m = parseInt(selectedMonth);
            if (!isNaN(y) && !isNaN(m)) {
                fetchMonthSchedules(y, m);
            }
        }
    }, [selectedYear, selectedMonth, fetchMonthSchedules]);

    const itemsPerPage = 15;

    // 년도 목록 추출 (데이터에 있는 년도만)
    const currentYear = new Date().getFullYear();
    const dataYears = schedules.map(s => {
        if (!s.date) return null;
        return new Date(s.date).getFullYear();
    }).filter(y => y !== null);

    const availableYears = [...new Set(dataYears.length > 0 ? dataYears : [currentYear])].sort((a, b) => b - a);

    // 월 목록 (1~12)
    const availableMonths = Array.from({ length: 12 }, (_, i) => i + 1);

    // 일 목록 (1~31)
    const availableDays = Array.from({ length: 31 }, (_, i) => i + 1);

    // 필터링 및 정렬
    const filteredSchedules = schedules.filter(s => {
        if (!s.date) return false;
        const d = new Date(s.date);

        // 년도 필터
        if (selectedYear !== 'all' && d.getFullYear() !== parseInt(selectedYear)) return false;

        // 월 필터
        if (selectedMonth !== 'all' && (d.getMonth() + 1) !== parseInt(selectedMonth)) return false;

        // 일 필터
        if (selectedDay !== 'all' && d.getDate() !== parseInt(selectedDay)) return false;

        // 구분 필터
        if (selectedType !== 'all' && s.typeCode !== selectedType) return false;

        // 담당 컨설턴트 필터
        if (selectedConsultant !== 'all' && s.consultantId !== selectedConsultant) return false;

        // 장소 검색 (부분 일치)
        if (searchLocation.trim() && !(s.location || '').toLowerCase().includes(searchLocation.toLowerCase().trim())) return false;

        return true;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    // 페이지네이션 로직
    const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);
    const paginatedSchedules = filteredSchedules.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // 페이지 변경 핸들러
    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    // 필터 변경 핸들러들
    const handleFilterChange = (setter) => (e) => {
        setter(e.target.value);
        setCurrentPage(1);
    };

    // 필터 초기화
    const resetFilters = () => {
        setSelectedYear('all');
        setSelectedMonth('all');
        setSelectedDay('all');
        setSelectedType('all');
        setSelectedConsultant('all');
        setSearchLocation('');
        setCurrentPage(1);
    };

    // 필터 활성화 여부
    const hasActiveFilters = selectedYear !== 'all' || selectedMonth !== 'all' || selectedDay !== 'all' ||
        selectedType !== 'all' || selectedConsultant !== 'all' || searchLocation.trim() !== '';

    // 폼 상태
    const [formData, setFormData] = useState({
        date: '',
        endDate: '',
        location: '',
        consultantId: '',
        typeCode: '',
        memo: ''
    });

    // 컨설턴트 목록 (role이 consultant인 사용자)
    const consultants = users.filter(u => u.role === 'consultant' || u.role === 'admin');

    // 모달 열기 (등록/수정)
    const openModal = (schedule = null) => {
        if (schedule) {
            setEditingSchedule(schedule);
            setFormData({
                date: schedule.date || '',
                endDate: schedule.endDate || '',
                location: schedule.location || '',
                consultantId: schedule.consultantId || '',
                typeCode: schedule.typeCode || '',
                memo: schedule.memo || ''
            });
        } else {
            setEditingSchedule(null);
            setFormData({
                date: '',
                endDate: '',
                location: '',
                consultantId: '',
                typeCode: '',
                memo: ''
            });
        }
        setIsModalOpen(true);
    };

    // 폼 제출
    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingSchedule) {
                await updateSchedule(editingSchedule.id, formData);
            } else {
                await addSchedule(formData);
            }
            setIsModalOpen(false);
            setEditingSchedule(null);
        } catch (error) {
            console.error('일정 저장 실패:', error);
            alert('일정 저장에 실패했습니다.');
        }
    };

    // 엑셀 날짜 변환 헬퍼 (스크린샷 형식 대응)
    const parseExcelDate = (dateVal, timeVal) => {
        let date;

        // 1. 날짜 처리
        if (typeof dateVal === 'number') {
            // 엑셀 시리얼 넘버
            date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        } else if (typeof dateVal === 'string') {
            // '2025년 11월 15일 토요일' 형식 처리
            const match = dateVal.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
            if (match) {
                date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            } else {
                date = new Date(dateVal);
            }
        }

        if (!date || isNaN(date.getTime())) return '';

        // 2. 시간 처리
        if (timeVal !== undefined && timeVal !== null) {
            if (typeof timeVal === 'number') {
                // 엑셀 시간 시리얼 (0 ~ 1 사이의 소수)
                const totalSeconds = Math.round(timeVal * 86400);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                date.setHours(hours, minutes, 0, 0);
            } else if (typeof timeVal === 'string') {
                // '9:30' 또는 '09:30' 형식 처리
                const timeMatch = timeVal.match(/(\d{1,2}):(\d{1,2})/);
                if (timeMatch) {
                    date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
                }
            }
        } else {
            date.setHours(9, 0, 0, 0);
        }

        // 로컬 시간 기준으로 ISO 포맷 생성 (YYYY-MM-DDTHH:mm)
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };

    // 엑셀 업로드 처리 (새 형식: 월별 시트, 요일 헤더, 셀 형식: "HH:MM 상담종류(컨설턴트)*비고")
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 업로드 방식 선택
        const uploadMode = window.confirm(
            '업로드 방식을 선택하세요:\n\n' +
            '✅ 확인: 기존 데이터와 머지 (변경/삭제 추적)\n' +
            '❌ 취소: 기존 데이터 삭제 후 새로 업로드'
        ) ? 'merge' : 'replace';

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const allSchedules = [];
                const encounteredMonths = new Set(); // 엑셀 시트들에서 발견된 모든 'YYYY-MM' 목록
                const missingConsultants = new Set();
                const missingTypes = new Set();
                let totalParsed = 0;

                // 스케줄 셀 파싱 정규식: "HH:MM 상담종류(컨설턴트)*비고" 형식
                const schedulePattern = /^(\d{1,2}:\d{2})\s+(.+?)\((.+?)\)(\*.*)?$/;

                // 이름 정규화 함수
                const normalize = (str) => {
                    if (!str) return '';
                    return str.toString().trim()
                        .replace(/\s+T$/, '')      // "심영섭 T" -> "심영섭"
                        .replace(/\s+/g, '')       // 공백 제거
                        .replace(/[()]/g, '');     // 괄호 제거
                };

                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                    if (rawRows.length < 3) return;

                    // Row 0: 기준 날짜 (엑셀 시리얼 넘버)
                    // Row 1: 요일 헤더 (월요일, 화요일, ...)
                    // Row 2+: 데이터 행 (0~5열에 날짜 or 스케줄)

                    // 시트명에서 년/월 추출 시도 (예: 2027-1월, 1월 등)
                    let fallbackYear = new Date().getFullYear();
                    let fallbackMonth = new Date().getMonth();

                    const yearMatch = sheetName.match(/(\d{4})/);
                    if (yearMatch) fallbackYear = parseInt(yearMatch[1]);

                    const monthMatch = sheetName.match(/(\d{1,2})월/);
                    if (monthMatch) fallbackMonth = parseInt(monthMatch[1]) - 1;

                    // Row 0의 모든 셀을 검사하여 년/월 정보 추출 (엑셀 내 텍스트가 시트명보다 우선순위 높음)
                    let baseYear = fallbackYear;
                    let baseMonth = fallbackMonth;
                    let headerFound = false;

                    const firstRow = rawRows[0] || [];
                    for (let i = 0; i < firstRow.length; i++) {
                        const cell = firstRow[i];
                        if (!cell) continue;

                        if (typeof cell === 'number' && cell > 40000) {
                            // 엑셀 시리얼 날짜 (예: 46082 -> 2026-03-01)
                            const d = new Date((cell - 25569) * 86400 * 1000);
                            baseYear = d.getFullYear();
                            baseMonth = d.getMonth();
                            headerFound = true;
                            break;
                        } else if (typeof cell === 'string') {
                            // 문자열 검색 (예: "2026년 3월")
                            const ymMatch = cell.match(/(\d{4})년\s*(\d{1,2})월/);
                            if (ymMatch) {
                                baseYear = parseInt(ymMatch[1]);
                                baseMonth = parseInt(ymMatch[2]) - 1;
                                headerFound = true;
                                break;
                            }
                            // 년도만 있는 경우
                            const yMatch = cell.match(/(\d{4})년/);
                            if (yMatch) {
                                baseYear = parseInt(yMatch[1]);
                                headerFound = true;
                            }
                            // 월만 있는 경우
                            const mMatch = cell.match(/(\d{1,2})월/);
                            if (mMatch) {
                                baseMonth = parseInt(mMatch[1]) - 1;
                                headerFound = true;
                            }
                            if (headerFound) break;
                        }
                    }

                    const baseDate = new Date(baseYear, baseMonth, 1);

                    if (!baseDate || isNaN(baseDate.getTime())) {
                        return;
                    }

                    const confirmedMonth = baseDate.getMonth();
                    const confirmedYear = baseDate.getFullYear();

                    // 이번 시트의 년-월 키 기록
                    const currentMonthKey = `${confirmedYear}-${String(confirmedMonth + 1).padStart(2, '0')}`;
                    encounteredMonths.add(currentMonthKey);

                    // 현재 주의 날짜 정보 (일~토 등 7개 이상의 열에 대응할 수 있도록 넉넉히 설정)
                    let currentWeekDates = new Array(10).fill(null);

                    // Row 2부터 데이터 파싱
                    for (let rowIdx = 2; rowIdx < rawRows.length; rowIdx++) {
                        const row = rawRows[rowIdx];
                        if (!row || row.every(cell => cell === '' || cell === null)) continue;

                        // 각 열(최대 10열까지 검사하여 토요일 등 누락 방지) 처리
                        for (let colIdx = 0; colIdx < Math.min(row.length, 10); colIdx++) {
                            const cellValue = row[colIdx];
                            if (cellValue === '' || cellValue === null || cellValue === undefined) continue;

                            // 숫자인 경우: 날짜(일)
                            if (typeof cellValue === 'number' && cellValue >= 1 && cellValue <= 31) {
                                currentWeekDates[colIdx] = cellValue;
                                continue;
                            }

                            // 문자열인 경우: 스케줄 또는 공휴일 표시
                            if (typeof cellValue === 'string') {
                                const cellStr = cellValue.trim();

                                // 스케줄 패턴 매칭 강화 (더욱 유연하게 수정)
                                // 1. 시간 패턴 (\d{1,2}[:.]\d{2}) : 콜론이나 점 모두 허용
                                // 2. 유형+괄호명 : 무엇이든(누구누구) 형식 인식
                                // 3. 뒤에 무엇이 더 있든($ 없이 처리) 유연하게 허용
                                const match = cellStr.match(/(\d{1,2}[:.]\d{2})\s*([^(]+)\(([^)]+)\)/);

                                if (match && currentWeekDates[colIdx]) {
                                    const [, timeRaw, typeName, rawContentInParens] = match;
                                    const timeStr = timeRaw.replace('.', ':'); // 시간 형식을 콜론으로 통일
                                    const day = currentWeekDates[colIdx];

                                    // 비고(note)는 괄호 뒤에 오는 모든 텍스트로 처리
                                    const noteRaw = cellStr.split(')').slice(1).join(')').trim();
                                    // 괄호 뒤에 * 로 시작하는 경우와 그렇지 않은 경우 모두 처리
                                    let note = noteRaw ? noteRaw.replace(/^\*/, '').trim() : '';

                                    // 괄호 안의 내용(rawContentInParens) 처리: "이름_장소" 또는 "이름"
                                    let consultantName = rawContentInParens.trim();

                                    // 언더스코어(_)가 있으면 분리
                                    if (consultantName.includes('_')) {
                                        const parts = consultantName.split('_');
                                        consultantName = parts[0].trim();
                                        const locationInParens = parts.slice(1).join('_').trim();

                                        // 괄호 안 장소 정보가 있으면 note에 추가 (기존 note가 있으면 공백으로 구분)
                                        if (locationInParens) {
                                            note = note ? `${locationInParens} ${note}` : locationInParens;
                                        }
                                    }

                                    // 시간 파싱
                                    const timeParts = timeStr.split(':').map(Number);
                                    const hours = timeParts[0];
                                    const minutes = timeParts[1];

                                    // 날짜 생성 (확정된 년, 월 사용)
                                    const scheduleDate = new Date(confirmedYear, confirmedMonth, day, hours, minutes, 0, 0);

                                    // ISO 문자열로 변환 (로컬 시간 기준 정규화)
                                    // 분 단위까지만 저장하여 매칭 정확도 향상
                                    const dateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

                                    // 코드 매칭 (더미 코드 사용)
                                    const normType = normalize(typeName);
                                    const typeCodeObj = codes.find(c =>
                                        normalize(c.name) === normType
                                    );

                                    // 컨설턴터 매칭 (정확히 일치하는 이름 찾기)
                                    const normUser = normalize(consultantName);
                                    const consultantObj = users.find(u =>
                                        normalize(u.name) === normUser
                                    );

                                    totalParsed++;

                                    if (typeCodeObj) {
                                        allSchedules.push({
                                            date: dateStr,
                                            typeCode: typeCodeObj.code,
                                            typeName: typeCodeObj.name,
                                            consultantId: consultantObj?.uid || consultantObj?.id || `unknown_${normalize(consultantName)}`,
                                            consultantName: consultantName,
                                            location: note || '',
                                            memo: note || ''
                                        });
                                    } else {
                                        // 코드는 없지만 일정은 추가 (typeName으로 저장)
                                        allSchedules.push({
                                            date: dateStr,
                                            typeCode: typeName.trim(),
                                            typeName: typeName.trim(),
                                            consultantId: consultantObj?.uid || consultantObj?.id || `unknown_${normalize(consultantName)}`,
                                            consultantName: consultantName,
                                            location: note || '',
                                            memo: note || ''
                                        });
                                        missingTypes.add(typeName.trim());
                                    }

                                    if (!consultantObj) {
                                        missingConsultants.add(consultantName);
                                    }
                                }
                            }
                        }
                    }
                });

                if (allSchedules.length > 0) {
                    let resultMsg = '';

                    if (uploadMode === 'merge') {
                        // 머지 모드: 변경 추적
                        const mergeResult = await mergeSchedules(allSchedules, false);
                        resultMsg = `📊 엑셀 업로드 완료!\n\n` +
                            `✅ 새로 추가: ${mergeResult.added.length}건\n` +
                            `🔄 변경됨: ${mergeResult.updated.length}건\n` +
                            `❌ 삭제됨: ${mergeResult.deleted.length}건\n` +
                            `⬜ 변경없음: ${mergeResult.unchanged.length}건`;

                        // 삭제된 항목 상세 표시
                        if (mergeResult.deleted.length > 0 && mergeResult.deleted.length <= 10) {
                            resultMsg += `\n\n[삭제된 일정]\n`;
                            mergeResult.deleted.forEach(s => {
                                const d = new Date(s.date);
                                resultMsg += `- ${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} ${s.consultantName || s.typeName}\n`;
                            });
                        }

                        // 탭 전환
                        setActiveTab('log');
                    } else {
                        // 전체 교체 모드 (발견된 달들만 대상으로 교체)
                        const mergeResult = await mergeSchedules(allSchedules, true, Array.from(encounteredMonths));
                        resultMsg = `📊 엑셀 업로드 완료!\n\n` +
                            `✅ 새로 등록: ${mergeResult.added.length}건\n` +
                            `🗑️ 기존 삭제: ${mergeResult.deleted.length}건`;

                        // 목록 탭 유지 (초기화 시에는 로그 불필요)
                        setActiveTab('list');
                    }

                    if (missingTypes.size > 0) {
                        resultMsg += `\n\n⚠️ [미등록 상담유형]: ${Array.from(missingTypes).join(', ')}`;
                    }
                    if (missingConsultants.size > 0) {
                        resultMsg += `\n\n⚠️ [미등록 컨설턴트]: ${Array.from(missingConsultants).join(', ')}`;
                    }

                    alert(resultMsg);
                } else {
                    alert(`유효한 스케줄을 찾을 수 없습니다.\n\n분석된 셀 수: ${totalParsed}\n\n엑셀 형식을 확인해주세요:\n- 각 시트가 월별로 구성되어 있는지\n- 첫 행에 기준 날짜가 있는지\n- 스케줄 형식: "10:00 서류면접(심영섭)"`);
                }
            } catch (error) {
                console.error('Excel upload error:', error);
                alert('엑셀 파일 처리에 실패했습니다.\n\n' + error.message);
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        reader.readAsArrayBuffer(file);
    };

    // 일정 삭제
    const handleDelete = async (id) => {
        if (window.confirm('정말 이 일정을 삭제하시겠습니까?')) {
            try {
                await deleteSchedule(id);
            } catch (error) {
                console.error('일정 삭제 실패:', error);
                alert('일정 삭제에 실패했습니다.');
            }
        }
    };

    // 코드명 조회
    const getTypeName = (typeCode) => {
        const code = codes.find(c => c.code === typeCode);
        return code?.name || '-';
    };

    // 컨설턴트명 조회
    const getConsultantName = (consultantId) => {
        const consultant = users.find(u => u.uid === consultantId);
        return consultant?.name || '-';
    };

    if (loading) {
        return (
            <>
                <Header title="일정 관리" onMenuClick={openSidebar} />
                <div className="page-content">
                    <LoadingSpinner message="일정을 불러오는 중..." />
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="일정 관리" onMenuClick={openSidebar} />
            <div className="page-content">
                <div className="page-header flex justify-between items-center mb-6">
                    <div>
                        <h1 className="page-title">일정 관리</h1>
                        <p className="page-description">컨설팅 일정을 통합 관리합니다</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                {/* Tab Navigation (Modern Pill Style) */}
                <div className="flex items-center gap-1 bg-gray-100/80 p-1.5 rounded-xl w-fit mb-8 shadow-inner" style={{ padding: "10px" }}>
                    <button
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'list'
                            ? 'bg-white text-[#00462A] shadow-sm ring-1 ring-gray-200'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                            }`} style={{ padding: "10px", cursor: "pointer" }}
                        onClick={() => setActiveTab('list')}
                    >
                        <Calendar size={16} strokeWidth={2.5} />
                        전체 일정 목록
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'list' ? 'bg-[#00462A]/10 text-[#00462A]' : 'bg-gray-200 text-gray-500'}`} style={{ padding: "5px", borderRadius: "50%" }}>
                            {schedules.length}
                        </span>
                    </button>
                    <button
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'log'
                            ? 'bg-white text-[#00462A] shadow-sm ring-1 ring-gray-200'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                            }`} style={{ padding: "10px", cursor: "pointer" }}
                        onClick={() => setActiveTab('log')}
                    >
                        <FileText size={16} strokeWidth={2.5} />
                        업로드/변경 이력
                        {changeLog.length > 0 && (
                            <span className={`px-1.5 min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] ${activeTab === 'log' ? 'bg-red-500 text-white shadow-sm' : 'bg-gray-300 text-white'
                                }`}>
                                {changeLog.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'list' ? (
                    <div className="animate-fade-in">


                        {/* Action Toolbar */}
                        <div className="flex justify-between items-center mb-4" style={{ paddingBottom: "10px", marginTop: "5px" }}>
                            {/* Filter Bar */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4" style={{ padding: "10px" }}>
                                <div className="flex flex-wrap gap-3 items-center">
                                    {/* 년도 필터 */}
                                    <div className="relative">
                                        <select
                                            style={{ padding: "5px" }}
                                            className="min-w-[110px] pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00462A] focus:border-transparent appearance-none cursor-pointer hover:border-gray-300"
                                            value={selectedYear}
                                            onChange={handleFilterChange(setSelectedYear)}
                                        >
                                            <option value="all">전체 년도</option>
                                            {availableYears.map(year => (
                                                <option key={year} value={year}>{year}년</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>

                                    {/* 월 필터 */}
                                    <div className="relative">
                                        <select
                                            style={{ padding: "5px" }}
                                            className="min-w-[90px] pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00462A] focus:border-transparent appearance-none cursor-pointer hover:border-gray-300"
                                            value={selectedMonth}
                                            onChange={handleFilterChange(setSelectedMonth)}
                                        >
                                            <option value="all">전체 월</option>
                                            {availableMonths.map(month => (
                                                <option key={month} value={month}>{month}월</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>

                                    {/* 일 필터 */}
                                    <div className="relative">
                                        <select
                                            style={{ padding: "5px" }}
                                            className="min-w-[80px] pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00462A] focus:border-transparent appearance-none cursor-pointer hover:border-gray-300"
                                            value={selectedDay}
                                            onChange={handleFilterChange(setSelectedDay)}
                                        >
                                            <option value="all">전체 일</option>
                                            {availableDays.map(day => (
                                                <option key={day} value={day}>{day}일</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>

                                    <div className="w-px h-6 bg-gray-200"></div>

                                    {/* 구분 필터 */}
                                    <div className="relative">
                                        <select
                                            style={{ padding: "5px" }}
                                            className="min-w-[110px] pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00462A] focus:border-transparent appearance-none cursor-pointer hover:border-gray-300"
                                            value={selectedType}
                                            onChange={handleFilterChange(setSelectedType)}
                                        >
                                            <option value="all">전체 구분</option>
                                            {codes.map(code => (
                                                <option key={code.code} value={code.code}>{code.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>

                                    {/* 담당 컨설턴트 필터 */}
                                    <div className="relative">
                                        <select
                                            style={{ padding: "5px" }}
                                            className="min-w-[130px] pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00462A] focus:border-transparent appearance-none cursor-pointer hover:border-gray-300"
                                            value={selectedConsultant}
                                            onChange={handleFilterChange(setSelectedConsultant)}
                                        >
                                            <option value="all">전체 컨설턴트</option>
                                            {consultants.map(c => (
                                                <option key={c.uid || c.id} value={c.uid || c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>

                                    {/* 장소 검색 */}
                                    <div className="relative flex-1 min-w-[150px] max-w-[200px]" >
                                        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            style={{ padding: "5px", textAlign: "center" }}
                                            type="text"
                                            placeholder="장소 검색"
                                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00462A] focus:border-transparent hover:border-gray-300"
                                            value={searchLocation}
                                            onChange={(e) => { setSearchLocation(e.target.value); setCurrentPage(1); }}
                                        />
                                    </div>

                                    {/* 필터 초기화 버튼 */}
                                    {hasActiveFilters && (
                                        <button
                                            onClick={resetFilters}
                                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                            초기화
                                        </button>
                                    )}

                                    {/* 결과 건수 */}
                                    <div className="ml-auto">
                                        <span className="text-sm text-gray-500 font-medium">
                                            검색결과 <span className="text-[#00462A] font-bold">{filteredSchedules.length}</span>건
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleExcelUpload}
                                    accept=".xlsx, .xls "
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="btn btn-secondary shadow-sm hover:border-[#00462A] hover:text-[#00462A]"
                                >
                                    {isUploading ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Upload size={18} />
                                    )}
                                    엑셀 업로드
                                </button>
                                <button
                                    onClick={() => openModal()}
                                    className="btn btn-primary shadow-md"
                                >
                                    <Plus size={18} />
                                    새 일정 등록
                                </button>
                            </div>
                        </div>

                        {/* Schedules Table */}
                        <div className="card w-full shadow-sm">
                            <div className="card-header border-b border-gray-100 bg-gray-50/30 flex justify-between items-center">
                                <h3 className="font-semibold text-gray-900">
                                    {selectedYear === 'all' ? '전체 일정 목록' : `${selectedYear}년 일정 목록`}
                                    <span className="text-gray-400 font-normal ml-1">({filteredSchedules.length}건)</span>
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>일시</th>
                                            <th>구분</th>
                                            <th>담당 컨설턴트</th>
                                            <th>장소</th>
                                            <th className="text-right">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSchedules.length === 0 ? (
                                            <tr>
                                                <td colSpan="5">
                                                    <div className="empty-state py-20">
                                                        <Calendar size={48} className="empty-state-icon mx-auto opacity-20" />
                                                        <h3 className="mt-4 text-gray-400">
                                                            {selectedYear === 'all' ? '등록된 일정이 없습니다' : `${selectedYear}년도 일정이 없습니다`}
                                                        </h3>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedSchedules.map(schedule => (
                                                <tr key={schedule.id}>
                                                    <td className="whitespace-nowrap" style={{ padding: '0.4rem' }}>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2 text-gray-900 font-medium">
                                                                <Calendar size={14} className="text-gray-400" />
                                                                {schedule.date ? new Date(schedule.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : '-'}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                                <Clock size={12} />
                                                                {schedule.date ? new Date(schedule.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="badge badge-green font-semibold">
                                                            {getTypeName(schedule.typeCode)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                                                                {getConsultantName(schedule.consultantId).charAt(0)}
                                                            </div>
                                                            <span className="text-gray-700">{getConsultantName(schedule.consultantId)}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                                                            <MapPin size={14} className="text-gray-400" />
                                                            {schedule.location || '-'}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => openModal(schedule)}
                                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                title="수정"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(schedule.id)}
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                title="삭제"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="relative border-t border-gray-100 bg-gray-50/30 px-6 py-4 flex items-center justify-center" style={{ padding: '10px' }}>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            // Simple pagination logic: show around current page
                                            let pageNum;
                                            if (totalPages <= 5) {
                                                pageNum = i + 1;
                                            } else if (currentPage <= 3) {
                                                pageNum = i + 1;
                                            } else if (currentPage >= totalPages - 2) {
                                                pageNum = totalPages - 4 + i;
                                            } else {
                                                pageNum = currentPage - 2 + i;
                                            }

                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => handlePageChange(pageNum)}
                                                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${currentPage === pageNum
                                                        ? 'bg-[#00462A] text-white border border-[#00462A] shadow-sm'
                                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                                        }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}

                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                    <div className="absolute right-6 text-sm text-gray-500">
                                        <span className="font-medium">{filteredSchedules.length}</span>개 중 <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredSchedules.length)}</span> 표시
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in space-y-4">
                        <div className="flex justify-between items-center mb-4 px-1" style={{ padding: "10px" }}>
                            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                최근 업로드 및 변경 이력
                            </div>
                        </div>

                        {changeLog.length === 0 ? (
                            <div className="empty-state py-24 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 text-gray-300">
                                    <FileText size={32} />
                                </div>
                                <h3 className="text-gray-900 font-semibold mb-1">변경 이력이 없습니다</h3>
                                <p className="text-sm text-gray-500 max-w-xs mx-auto">엑셀 파일을 업로드하면 변경 사항이 이곳에 자동으로 기록됩니다.</p>
                            </div>
                        ) : (
                            changeLog.map((log, index) => (
                                <LogItem key={log.id || index} log={log} index={index} />
                            ))
                        )}
                    </div>
                )}

                {/* Add/Edit Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEditingSchedule(null);
                    }}
                    title={editingSchedule ? '일정 수정' : '새 일정 등록'}
                    size="lg"
                >
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">시작 일시 *</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">종료 일시</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">컨설팅 구분 *</label>
                                    <select
                                        className="form-select"
                                        value={formData.typeCode}
                                        onChange={(e) => setFormData({ ...formData, typeCode: e.target.value })}
                                        required
                                    >
                                        <option value="">선택하세요</option>
                                        {codes.map(code => (
                                            <option key={code.id} value={code.code}>
                                                {code.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">담당 컨설턴트 *</label>
                                    <select
                                        className="form-select"
                                        value={formData.consultantId}
                                        onChange={(e) => setFormData({ ...formData, consultantId: e.target.value })}
                                        required
                                    >
                                        <option value="">선택하세요</option>
                                        {consultants.map(consultant => (
                                            <option key={consultant.id} value={consultant.uid}>
                                                {consultant.name} ({consultant.role === 'admin' ? '관리자' : '컨설턴트'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">장소</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        className="form-input pl-10"
                                        placeholder="컨설팅 장소를 입력하세요"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">메모</label>
                                <textarea
                                    className="form-input"
                                    rows={3}
                                    placeholder="상세 내용을 입력하세요 (자유 양식)"
                                    value={formData.memo}
                                    onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="modal-footer mt-8 -mx-6 -mb-6 px-6 py-4 bg-gray-50 rounded-b-lg">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingSchedule(null);
                                }}
                                className="btn btn-secondary"
                            >
                                취소
                            </button>
                            <button type="submit" className="btn btn-primary px-8">
                                {editingSchedule ? '수정 완료' : '일정 등록'}
                            </button>
                        </div>
                    </form>
                </Modal>

                {/* Scroll to Top Button */}
                <button
                    onClick={scrollToTop}
                    className={`fixed bottom-8 right-8 p-3 rounded-full bg-[#00462A] text-white shadow-lg hover:bg-[#00331F] transition-all duration-300 z-50 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
                        }`}
                    aria-label="맨 위로 스크롤"
                >
                    <ArrowUp size={24} />
                </button>
            </div >
        </>
    );
}
