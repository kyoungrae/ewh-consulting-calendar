import { useEffect, useRef, useState } from 'react';

const MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

function pad(n) {
    return String(n).padStart(2, '0');
}

/** 저장용 datetime-local 문자열 → { date, hour, minute } */
function splitDatetimeLocalValue(value) {
    if (!value) return { date: '', hour: '', minute: '' };
    const normalized = String(value).replace(' ', 'T');
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{1,2})/);
    if (!match) return { date: '', hour: '', minute: '' };

    let hour = Number(match[2]);
    let minute = Math.round(Number(match[3]) / 10) * 10;
    if (minute === 60) {
        hour = (hour + 1) % 24;
        minute = 0;
    }

    return {
        date: match[1],
        hour: String(hour),
        minute: String(minute)
    };
}

/** { date, hour, minute } → YYYY-MM-DDTHH:mm */
function joinDatetimeLocalValue({ date, hour, minute }) {
    if (!date || hour === '' || minute === '') return '';
    return `${date}T${pad(Number(hour))}:${pad(Number(minute))}`;
}

/**
 * 브라우저 native datetime-local 분 스피너는 step을 무시하는 경우가 많아
 * 날짜 + 시 + 분(10분 단위) 선택 UI로 고정합니다.
 */
export default function Datetime10MinInput({
    value = '',
    onChange,
    required = false,
    disabled = false,
    id,
    className = ''
}) {
    const [parts, setParts] = useState(() => splitDatetimeLocalValue(value));
    const lastEmittedRef = useRef(value);

    useEffect(() => {
        // 부모에서 값이 바뀐 경우만 동기화 (입력 중간 상태는 유지)
        if (value !== lastEmittedRef.current) {
            // External value changes reset partial date/hour/minute edits together.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setParts(splitDatetimeLocalValue(value));
            lastEmittedRef.current = value;
        }
    }, [value]);

    const updatePart = (patch) => {
        setParts((prev) => {
            const next = { ...prev, ...patch };
            const joined = joinDatetimeLocalValue(next);
            const cleared = !next.date && next.hour === '' && next.minute === '';

            if (joined || cleared) {
                lastEmittedRef.current = joined;
                onChange?.(joined);
            }

            return next;
        });
    };

    return (
        <div className={`datetime-10min-input flex flex-wrap gap-2 items-center ${className}`}>
            <input
                id={id}
                type="date"
                className="form-input flex-1 min-w-[140px]"
                value={parts.date}
                required={required}
                disabled={disabled}
                onChange={(e) => updatePart({ date: e.target.value })}
            />
            <select
                className="form-select w-[88px]"
                value={parts.hour}
                required={required}
                disabled={disabled}
                aria-label="시"
                onChange={(e) => updatePart({ hour: e.target.value })}
            >
                <option value="">시</option>
                {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={String(h)}>
                        {pad(h)}시
                    </option>
                ))}
            </select>
            <select
                className="form-select w-[88px]"
                value={parts.minute}
                required={required}
                disabled={disabled}
                aria-label="분"
                onChange={(e) => updatePart({ minute: e.target.value })}
            >
                <option value="">분</option>
                {MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={String(m)}>
                        {pad(m)}분
                    </option>
                ))}
            </select>
        </div>
    );
}
