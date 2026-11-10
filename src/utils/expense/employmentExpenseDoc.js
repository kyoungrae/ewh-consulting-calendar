import { Document, Paragraph, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import {
    PAGE_MARGIN,
    BORDERS,
    p,
    run,
    moneyLine,
    dayLines,
    blobDownload,
    fileStamp
} from './docCommon.js';
import { formatCurrency } from '../expenseFormat.js';

function blockParagraphs(block, index) {
    const nodes = [
        new Paragraph({
            spacing: { before: 160, after: 60 },
            children: [
                run(`(${index}) ${block.displayName} 강사= ${moneyLine(block.sessionCount, block.rate, block.amount)}`, {
                    bold: true,
                    size: 22
                })
            ]
        })
    ];
    for (const line of dayLines(block.days)) {
        nodes.push(p(`    ${line}`, { size: 20, spacing: { after: 40 } }));
    }
    return nodes;
}

function rateTable(blocks, title) {
    if (!blocks?.length) return [];
    const header = new TableRow({
        children: ['강사', '세션당 단가', '세션 수', '지급액'].map((label) => new TableCell({
            borders: BORDERS,
            width: { size: 2300, type: WidthType.DXA },
            shading: { fill: 'E8EEF2' },
            children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run(label, { bold: true, size: 18 })]
            })]
        }))
    });
    const rows = blocks.map((block) => new TableRow({
        children: [
            block.displayName,
            formatCurrency(block.rate),
            String(block.sessionCount),
            formatCurrency(block.amount)
        ].map((value, index) => new TableCell({
            borders: BORDERS,
            width: { size: 2300, type: WidthType.DXA },
            children: [new Paragraph({
                alignment: index === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
                children: [run(value, { size: 18 })]
            })]
        }))
    }));
    return [
        p(title, { bold: true, size: 20, spacing: { before: 160, after: 80 } }),
        new Table({ width: { size: 9200, type: WidthType.DXA }, rows: [header, ...rows] })
    ];
}

function section(title, blocks, startIndex = 1) {
    const nodes = [p(title, { bold: true, size: 24, spacing: { before: 140, after: 100 } })];
    if (!blocks?.length) {
        nodes.push(p('해당 내역 없음', { size: 20 }));
        return { nodes, nextIndex: startIndex };
    }
    blocks.forEach((block, index) => {
        nodes.push(...blockParagraphs(block, startIndex + index));
    });
    return { nodes, nextIndex: startIndex + blocks.length };
}

export function buildEmploymentExpenseDocument(model, { programName = '혁신' } = {}) {
    const children = [
        p(`[${programName}][취업컨설팅] 지출결의 상세내용`, {
            bold: true,
            size: 28,
            align: AlignmentType.CENTER,
            spacing: { after: 120 }
        }),
        p(`기간: ${model.periodLabel || '-'}`, { size: 20 }),
        p(`총 ${model.sessionCount || 0}세션 / ${formatCurrency(model.totalAmount || 0)}원`, { size: 20, spacing: { after: 160 } })
    ];

    let index = 1;
    const interview = section('[서류면접 컨설팅]', model.interviewBlocks, index);
    children.push(...interview.nodes);
    index = interview.nextIndex;

    const korean = model.correctionBlocks?.korean || [];
    const english = model.correctionBlocks?.english || [];
    if (korean.length || english.length) {
        children.push(p('[서면첨삭]', { bold: true, size: 24, spacing: { before: 180, after: 80 } }));
        if (korean.length) {
            const part = section('· 국문', korean, index);
            children.push(...part.nodes);
            index = part.nextIndex;
        }
        if (english.length) {
            const part = section('· 영문', english, index);
            children.push(...part.nodes);
            index = part.nextIndex;
        }
    }

    children.push(
        ...rateTable(model.interviewBlocks, '단가 기준표 (서류면접)'),
        ...rateTable(korean, '단가 기준표 (서면첨삭·국문)'),
        ...rateTable(english, '단가 기준표 (서면첨삭·영문)')
    );

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
