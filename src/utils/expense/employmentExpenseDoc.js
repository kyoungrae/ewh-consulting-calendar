import { Document, Paragraph, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import {
    PAGE_MARGIN,
    BORDERS,
    p,
    run,
    moneyLine,
    dayLines,
    periodMonthLabel,
    periodRangeLabel,
    blobDownload,
    fileStamp
} from './docCommon.js';
import { formatCurrency } from '../expenseFormat.js';

function blockParagraphs(block, index, { includeDays = true } = {}) {
    const nodes = [
        new Paragraph({
            spacing: { before: 120, after: 40 },
            children: [
                run(`(${index}) ${block.displayName} 강사= ${moneyLine(block.sessionCount, block.rate, block.amount)}`, {
                    size: 22
                })
            ]
        })
    ];
    if (includeDays) {
        for (const line of dayLines(block.days)) {
            nodes.push(p(`   ${line}`, { size: 20, spacing: { after: 20 } }));
        }
    }
    return nodes;
}

function criteriaTable(rows) {
    if (!rows?.length) return [];
    const widths = [3200, 2200, 3800];
    const header = new TableRow({
        children: ['컨설턴트명', '강사비/세션', '비고'].map((label, index) => new TableCell({
            borders: BORDERS,
            width: { size: widths[index], type: WidthType.DXA },
            shading: { fill: 'F3F4F6' },
            children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run(label, { bold: true, size: 18 })]
            })]
        }))
    });
    const body = rows.map((row) => new TableRow({
        children: [
            row.name,
            formatCurrency(row.rate),
            row.remark || ''
        ].map((value, index) => new TableCell({
            borders: BORDERS,
            width: { size: widths[index], type: WidthType.DXA },
            children: [new Paragraph({
                alignment: index === 1 ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [run(value, { size: 18 })]
            })]
        }))
    }));
    return [
        new Table({ width: { size: 9200, type: WidthType.DXA }, rows: [header, ...body] })
    ];
}

export function buildEmploymentExpenseDocument(model, { programName = '혁신' } = {}) {
    const monthLabel = periodMonthLabel(model.periodLabel);
    const rangeLabel = periodRangeLabel(model.periodLabel).replace(/\s/g, '');
    const children = [
        p(`[${programName}][취업컨설팅] 취업컨설팅 강사비 (${monthLabel}) 지급에 관한 사항입니다.`, {
            size: 22,
            spacing: { after: 160 }
        }),
        p('※ 강사별 강사비 지급 기준', { bold: true, size: 20, spacing: { after: 40 } }),
        p(' (2026 인재개발원 강사료 및 인건비 기준 책정(안) 내에서 인재개발원 컨설팅 경력 및 구분을 고려하여 산정)', {
            size: 16,
            spacing: { after: 120 }
        }),
        ...criteriaTable(model.rateCriteria || []),
        p('[서류면접 컨설팅]', { bold: true, size: 24, spacing: { before: 240, after: 100 } })
    ];

    (model.interviewBlocks || []).forEach((block, index) => {
        children.push(...blockParagraphs(block, index + 1, { includeDays: true }));
    });
    if (!(model.interviewBlocks || []).length) {
        children.push(p('해당 내역 없음', { size: 20 }));
    }

    const korean = model.correctionBlocks?.korean || [];
    const english = model.correctionBlocks?.english || [];
    if (korean.length || english.length) {
        children.push(p(`[서면첨삭] ${rangeLabel}`, { bold: true, size: 24, spacing: { before: 240, after: 80 } }));
        if (korean.length) {
            children.push(p('(국문)', { bold: true, size: 20, spacing: { before: 80, after: 60 } }));
            korean.forEach((block, index) => {
                children.push(...blockParagraphs(block, index + 1, { includeDays: false }));
            });
        }
        if (english.length) {
            children.push(p('(영문)', { bold: true, size: 20, spacing: { before: 120, after: 60 } }));
            english.forEach((block, index) => {
                children.push(...blockParagraphs(block, index + 1, { includeDays: false }));
            });
        }
    }

    return new Document({
        sections: [{
            properties: { page: { margin: PAGE_MARGIN } },
            children
        }]
    });
}

export async function downloadEmploymentExpenseDoc(model, options = {}) {
    const doc = buildEmploymentExpenseDocument(model, options);
    const programName = options.programName || '혁신';
    await blobDownload(doc, fileStamp(`[${programName}][취업컨설팅] 지출결의 상세내용`, model.periodLabel));
}
