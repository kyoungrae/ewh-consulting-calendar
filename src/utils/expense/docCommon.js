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

export function moneyLine(sessionCount, rate, amount) {
    return `총 ${sessionCount}세션*세션당 ${formatCurrency(rate)}원 = ${formatCurrency(amount)}원`;
}

export function dayLines(days = []) {
    return days.map((day) => {
        const times = (day.times || []).join(', ');
        const countLabel = day.count ? ` (${day.count}세션)` : '';
        return times ? `${day.dayKey} – ${times}${countLabel}` : `${day.dayKey}${countLabel}`;
    });
}

export function labelValueRow(label, value, { labelWidth = 2400, valueWidth = 6800, minHeight = 320 } = {}) {
    const lines = Array.isArray(value)
        ? value
        : String(value ?? '-').split('\n').filter((line, index, arr) => line || arr.length === 1);
    const valueParagraphs = (lines.length ? lines : ['-']).map((line) => new Paragraph({
        children: [run(line || '-', { size: 24 })]
    }));
    return new TableRow({
        height: { value: minHeight, rule: 'atLeast' },
        children: [
            new TableCell({
                borders: BORDERS,
                width: { size: labelWidth, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                shading: { fill: 'F3F4F6' },
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [run(label, { bold: true, size: 24 })]
                })]
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
    const response = await fetch(url);
    if (!response.ok) throw new Error('인재개발원 로고를 불러오지 못했습니다.');
    const buffer = await response.arrayBuffer();
    return new ImageRun({
        data: buffer,
        transformation: { width: 280, height: 42 },
        type: 'png'
    });
}

export function logoParagraph(image) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
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
