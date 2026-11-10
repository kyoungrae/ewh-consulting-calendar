import { Document, Paragraph, AlignmentType } from 'docx';
import {
    PAGE_MARGIN,
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

export function buildCareerExpenseDocument(model, { programName = '혁신' } = {}) {
    const children = [
        p(`[${programName}][진로컨설팅] 지출결의 상세내용`, {
            bold: true,
            size: 28,
            align: AlignmentType.CENTER,
            spacing: { after: 120 }
        }),
        p(`기간: ${model.periodLabel || '-'}`, { size: 20 }),
        p(`총 ${model.sessionCount || 0}세션 / ${formatCurrency(model.totalAmount || 0)}원`, { size: 20, spacing: { after: 160 } }),
        p('[진로개발 컨설팅]', { bold: true, size: 24, spacing: { before: 80, after: 100 } })
    ];

    (model.interviewBlocks || []).forEach((block, index) => {
        children.push(...blockParagraphs(block, index + 1));
    });

    if (!(model.interviewBlocks || []).length) {
        children.push(p('집계된 진로 세션이 없습니다.', { size: 20 }));
    }

    return new Document({
        sections: [{
            properties: { page: { margin: PAGE_MARGIN } },
            children
        }]
    });
}

export async function downloadCareerExpenseDoc(model, options = {}) {
    const doc = buildCareerExpenseDocument(model, options);
    const programName = options.programName || '혁신';
    await blobDownload(doc, fileStamp(`[${programName}][진로컨설팅] 지출결의 상세내용`, model.periodLabel));
}
