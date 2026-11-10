import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    WidthType,
    AlignmentType,
    BorderStyle,
    HeadingLevel
} from 'docx';
import { amountToKorean, formatCurrency } from './expenseFormat.js';

const BORDER = { style: BorderStyle.SINGLE, size: 8, color: '000000' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function textCell(text, opts = {}) {
    const {
        bold = false,
        width = 1500,
        align = AlignmentType.CENTER,
        fill,
        fontSize = 18
    } = opts;
    return new TableCell({
        borders: BORDERS,
        width: { size: width, type: WidthType.DXA },
        shading: fill ? { fill } : undefined,
        children: [
            new Paragraph({
                alignment: align,
                children: [
                    new TextRun({
                        text: String(text ?? ''),
                        bold,
                        size: fontSize,
                        font: 'Malgun Gothic'
                    })
                ]
            })
        ]
    });
}

function titleParagraph(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text, bold: true, size: 32, font: 'Malgun Gothic' })]
    });
}

function metaParagraph(label, value) {
    return new Paragraph({
        spacing: { after: 80 },
        children: [
            new TextRun({ text: `${label}: `, bold: true, size: 20, font: 'Malgun Gothic' }),
            new TextRun({ text: String(value || '-'), size: 20, font: 'Malgun Gothic' })
        ]
    });
}

function emptyLine() {
    return new Paragraph({ children: [] });
}

export function buildDetailDocument({ meta, detailRows, totals }) {
    const header = new TableRow({
        children: [
            textCell('연번', { bold: true, width: 700, fill: 'E8EEF2' }),
            textCell('구분', { bold: true, width: 900, fill: 'E8EEF2' }),
            textCell('일자', { bold: true, width: 1400, fill: 'E8EEF2' }),
            textCell('시간', { bold: true, width: 900, fill: 'E8EEF2' }),
            textCell('유형', { bold: true, width: 1600, fill: 'E8EEF2' }),
            textCell('강사', { bold: true, width: 1200, fill: 'E8EEF2' }),
            textCell('학생', { bold: true, width: 1200, fill: 'E8EEF2' }),
            textCell('금액', { bold: true, width: 1300, fill: 'E8EEF2' })
        ]
    });

    const body = detailRows.map((row) => new TableRow({
        children: [
            textCell(row.no, { width: 700 }),
            textCell(row.sourceLabel, { width: 900 }),
            textCell(row.date, { width: 1400 }),
            textCell(row.time || '-', { width: 900 }),
            textCell(row.typeName, { width: 1600, align: AlignmentType.LEFT }),
            textCell(row.consultantName, { width: 1200 }),
            textCell(row.studentName || '-', { width: 1200 }),
            textCell(formatCurrency(row.amount), { width: 1300, align: AlignmentType.RIGHT })
        ]
    }));

    const totalRow = new TableRow({
        children: [
            textCell(`합계 ${totals.count}건`, {
                bold: true,
                width: 7900,
                align: AlignmentType.RIGHT,
                fill: 'F3F4F6'
            }),
            textCell(formatCurrency(totals.amount), {
                bold: true,
                width: 1300,
                align: AlignmentType.RIGHT,
                fill: 'F3F4F6'
            })
        ]
    });
    // Fix colspan: docx TableRow needs same column count - use merged cells via columnSpan
    const totalRowFixed = new TableRow({
        children: [
            new TableCell({
                borders: BORDERS,
                columnSpan: 7,
                width: { size: 7900, type: WidthType.DXA },
                shading: { fill: 'F3F4F6' },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({
                                text: `합계 ${totals.count}건`,
                                bold: true,
                                size: 18,
                                font: 'Malgun Gothic'
                            })
                        ]
                    })
                ]
            }),
            textCell(formatCurrency(totals.amount), {
                bold: true,
                width: 1300,
                align: AlignmentType.RIGHT,
                fill: 'F3F4F6'
            })
        ]
    });
    void totalRow;

    return new Document({
        sections: [{
            properties: {
                page: {
                    margin: { top: 720, right: 720, bottom: 720, left: 720 }
                }
            },
            children: [
                titleParagraph('지출결의 상세내역'),
                metaParagraph('사업명', meta.title),
                metaParagraph('지급 대상 기간', meta.periodLabel),
                metaParagraph('작성일', meta.createdAt),
                metaParagraph('진로 건수', `${totals.careerCount}건`),
                metaParagraph('취업 건수', `${totals.employmentCount}건`),
                emptyLine(),
                new Table({
                    width: { size: 9200, type: WidthType.DXA },
                    rows: [header, ...body, totalRowFixed]
                }),
                emptyLine(),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: '위 내역과 같이 컨설팅 강사료 지급을 요청합니다.',
                            size: 20,
                            font: 'Malgun Gothic'
                        })
                    ]
                })
            ]
        }]
    });
}

export function buildReceiptDocument({ meta, receiptRows, totals }) {
    const header = new TableRow({
        children: [
            textCell('연번', { bold: true, width: 800, fill: 'E8EEF2' }),
            textCell('강사', { bold: true, width: 1800, fill: 'E8EEF2' }),
            textCell('진로', { bold: true, width: 1200, fill: 'E8EEF2' }),
            textCell('취업', { bold: true, width: 1200, fill: 'E8EEF2' }),
            textCell('합계 건수', { bold: true, width: 1400, fill: 'E8EEF2' }),
            textCell('지급액', { bold: true, width: 2000, fill: 'E8EEF2' })
        ]
    });

    const body = receiptRows.map((row, index) => new TableRow({
        children: [
            textCell(index + 1, { width: 800 }),
            textCell(row.consultantName, { width: 1800 }),
            textCell(row.careerCount, { width: 1200 }),
            textCell(row.employmentCount, { width: 1200 }),
            textCell(row.count, { width: 1400 }),
            textCell(formatCurrency(row.amount), { width: 2000, align: AlignmentType.RIGHT })
        ]
    }));

    const total = new TableRow({
        children: [
            new TableCell({
                borders: BORDERS,
                columnSpan: 4,
                width: { size: 5000, type: WidthType.DXA },
                shading: { fill: 'F3F4F6' },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({
                                text: '합계',
                                bold: true,
                                size: 18,
                                font: 'Malgun Gothic'
                            })
                        ]
                    })
                ]
            }),
            textCell(totals.count, { bold: true, width: 1400, fill: 'F3F4F6' }),
            textCell(formatCurrency(totals.amount), {
                bold: true,
                width: 2000,
                align: AlignmentType.RIGHT,
                fill: 'F3F4F6'
            })
        ]
    });

    return new Document({
        sections: [{
            properties: {
                page: {
                    margin: { top: 720, right: 720, bottom: 720, left: 720 }
                }
            },
            children: [
                titleParagraph('강사료 지급 영수증'),
                metaParagraph('사업명', meta.title),
                metaParagraph('지급 대상 기간', meta.periodLabel),
                metaParagraph('작성일', meta.createdAt),
                emptyLine(),
                new Table({
                    width: { size: 8400, type: WidthType.DXA },
                    rows: [header, ...body, total]
                }),
                emptyLine(),
                new Paragraph({
                    spacing: { before: 200, after: 120 },
                    children: [
                        new TextRun({
                            text: `일금 ${amountToKorean(totals.amount)} (￦${formatCurrency(totals.amount)})`,
                            bold: true,
                            size: 24,
                            font: 'Malgun Gothic'
                        })
                    ]
                }),
                new Paragraph({
                    spacing: { after: 200 },
                    children: [
                        new TextRun({
                            text: '위 금액을 정히 영수합니다.',
                            size: 20,
                            font: 'Malgun Gothic'
                        })
                    ]
                }),
                emptyLine(),
                new Table({
                    width: { size: 8400, type: WidthType.DXA },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    borders: NO_BORDERS,
                                    width: { size: 4200, type: WidthType.DXA },
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: '영수인: ____________________ (인)',
                                                    size: 20,
                                                    font: 'Malgun Gothic'
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                new TableCell({
                                    borders: NO_BORDERS,
                                    width: { size: 4200, type: WidthType.DXA },
                                    children: [
                                        new Paragraph({
                                            alignment: AlignmentType.RIGHT,
                                            children: [
                                                new TextRun({
                                                    text: meta.createdAt,
                                                    size: 20,
                                                    font: 'Malgun Gothic'
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                })
            ]
        }]
    });
}

export async function downloadExpenseWord(kind, payload) {
    const { saveAs } = await import('file-saver');
    const doc = kind === 'receipt'
        ? buildReceiptDocument(payload)
        : buildDetailDocument(payload);
    const blob = await Packer.toBlob(doc);
    const stamp = (payload.meta?.periodLabel || '기간').replace(/\s+/g, '_');
    const name = kind === 'receipt'
        ? `지출결의_영수증_${stamp}.docx`
        : `지출결의_상세내역_${stamp}.docx`;
    saveAs(blob, name);
}

export { amountToKorean, formatCurrency } from './expenseFormat.js';
