import {
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
    ImageRun,
    VerticalAlign
} from 'docx';
import { Packer } from 'docx';
import { formatCurrency } from '../expenseFormat.js';

export const PAGE_MARGIN = { top: 480, right: 480, bottom: 480, left: 480 };
export const FONT = 'Malgun Gothic';

const BORDER = { style: BorderStyle.SINGLE, size: 8, color: '000000' };
export const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
export const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };

export function run(text, { bold = false, size = 22, color } = {}) {
    return new TextRun({ text: String(text ?? ''), bold, size, font: FONT, color });
}

export function p(text, opts = {}) {
    const { bold = false, size = 22, align = AlignmentType.LEFT, spacing = { after: 80 } } = opts;
    return new Paragraph({
        alignment: align,
        spacing,
        children: [run(text, { bold, size })]
    });
}

/** detail: 총7세션*세션당80,000원= 560,000원 / receipt: 총 7세션*세션당 80,000원= 560,000원 */
export function moneyLine(sessionCount, rate, amount, { spaced = false } = {}) {
    const count = Number(sessionCount) || 0;
    const rateText = formatCurrency(rate);
    const amountText = formatCurrency(amount);
    if (spaced) return `총 ${count}세션*세션당 ${rateText}원= ${amountText}원`;
    return `총${count}세션*세션당${rateText}원= ${amountText}원`;
}

export function dayLines(days = []) {
    return days.map((day) => {
        const times = (day.times || []).join(', ');
        const countLabel = day.count ? ` (${day.count}세션)` : '';
        return times ? `${day.dayKey} – ${times}${countLabel}` : `${day.dayKey}${countLabel}`;
    });
}

/** 26.10 -> 26년 10월 */
export function periodMonthLabel(periodLabel = '') {
    const match = String(periodLabel).match(/(\d{2})\.(\d{1,2})/);
    if (!match) return periodLabel || '-';
    return `${match[1]}년 ${Number(match[2])}월`;
}

/** 26.10 -> 26년 10/1~10/31 */
export function periodRangeLabel(periodLabel = '') {
    const match = String(periodLabel).match(/(\d{2})\.(\d{1,2})/);
    if (!match) return periodLabel || '-';
    const month = Number(match[2]);
    const year = 2000 + Number(match[1]);
    const last = new Date(year, month, 0).getDate();
    return `${match[1]}년 ${month}/1~${month}/${last}`;
}

/** YYYY-MM-DD or Date-like -> 75.09.13 */
export function formatBirthDate(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1].slice(2)}.${iso[2]}.${iso[3]}`;
    const dotted = text.match(/^(\d{2,4})[./](\d{1,2})[./](\d{1,2})/);
    if (dotted) {
        const yy = dotted[1].length === 4 ? dotted[1].slice(2) : dotted[1].padStart(2, '0');
        return `${yy}.${String(dotted[2]).padStart(2, '0')}.${String(dotted[3]).padStart(2, '0')}`;
    }
    return text;
}

export function bankAccountLines(bank) {
    return [
        `은 행 명: ${bank?.bank || '-'}`,
        `계좌번호: ${bank?.account || '-'}`,
        `예 금 주: ${bank?.holder || '-'}`
    ];
}

export function labelValueRow(label, value, { labelWidth = 2400, valueWidth = 6800, minHeight = 320 } = {}) {
    const lines = Array.isArray(value)
        ? value
        : String(value ?? '-').split('\n').filter((line, index, arr) => line || arr.length === 1);
    const valueParagraphs = (lines.length ? lines : ['-']).map((line) => new Paragraph({
        children: [run(line || '-', { size: 24 })]
    }));
    const labelParagraphs = String(label ?? '').split('\n').map((line) => new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run(line, { bold: true, size: 24 })]
    }));
    return new TableRow({
        height: { value: minHeight, rule: 'atLeast' },
        children: [
            new TableCell({
                borders: BORDERS,
                width: { size: labelWidth, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                shading: { fill: 'F3F4F6' },
                children: labelParagraphs
            }),
            new TableCell({
                borders: BORDERS,
                width: { size: valueWidth, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                children: valueParagraphs
            })
        ]
    });
}

export function simpleTable(rows) {
    return new Table({
        width: { size: 9200, type: WidthType.DXA },
        rows
    });
}

export async function loadLogoImage() {
    const url = new URL('../../assets/ewha-career-logo.png', import.meta.url);
    let data;
    try {
        const response = await fetch(url);
        if (response.ok) data = await response.arrayBuffer();
    } catch {
        // Node 테스트 등 fetch(file:) 미지원 환경
    }
    if (!data) {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        data = readFileSync(fileURLToPath(url));
    }
    return new ImageRun({
        data,
        transformation: { width: 280, height: 42 },
        type: 'png'
    });
}

export function logoParagraph(image) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 280, after: 80 },
        children: [image]
    });
}

export async function blobDownload(doc, fileName) {
    const blob = await Packer.toBlob(doc);
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

export function fileStamp(prefix, periodLabel) {
    const stamp = periodLabel || '기간';
    return `${prefix} (${stamp}).docx`;
}
