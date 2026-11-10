import { Document, Paragraph, AlignmentType, Table, WidthType } from 'docx';
import {
    PAGE_MARGIN,
    p,
    run,
    moneyLine,
    dayLines,
    labelValueRow,
    loadLogoImage,
    logoParagraph,
    blobDownload,
    fileStamp
} from './docCommon.js';
import { findConsultantProfile, formatBankAccount } from './consultantMaster.js';
import { indexConsultantMasters } from './consultantMaster.js';

function receiptItemFromBlock(block) {
    return {
        content: '진로컨설팅(진로개발)',
        paymentLine: moneyLine(block.sessionCount, block.rate, block.amount),
        scheduleLines: dayLines(block.days),
        displayName: block.displayName,
        consultantKey: block.consultant,
        missingProfile: block.missingProfile
    };
}

function buildReceiptSection(item, profile, logo) {
    const bank = formatBankAccount(profile?.bankAccount);
    const place = profile?.placeInterview || '온라인 ZOOM/접수';
    const nameLine = profile
        ? `${profile.name}${profile.uniqueNumber ? ` (${profile.uniqueNumber})` : ''}`
        : `${item.displayName} (마스터 없음)`;
    const warning = (!profile || item.missingProfile)
        ? [new Paragraph({
            spacing: { after: 80 },
            children: [run('⚠ 상담사 마스터에 인적/계좌 정보가 없습니다. 회원관리에서 보완해 주세요.', {
                bold: true,
                size: 18,
                color: 'B45309'
            })]
        })]
        : [];

    const rows = [
        labelValueRow('성명(고유번호)', nameLine),
        labelValueRow('생년월일', profile?.birthDate || '-'),
        labelValueRow('핸드폰', profile?.tel || '-'),
        labelValueRow('소속/주소', [profile?.affiliation, profile?.address].filter(Boolean).join(' / ') || '-'),
        labelValueRow('내용', item.content),
        labelValueRow('지급액', item.paymentLine),
        labelValueRow('강의일시', item.scheduleLines.join('\n') || '-'),
        labelValueRow('장소', place),
        labelValueRow('입금계좌', `${bank.bank} / ${bank.account} / ${bank.holder}`)
    ];

    return [
        p('강사비 영수증', { bold: true, size: 28, align: AlignmentType.CENTER, spacing: { after: 160 } }),
        ...warning,
        new Table({ width: { size: 9200, type: WidthType.DXA }, rows }),
        logoParagraph(logo)
    ];
}

export async function buildCareerReceiptDocument(model, masters = []) {
    const logo = await loadLogoImage();
    const mastersByName = indexConsultantMasters(masters);
    const items = (model.interviewBlocks || []).map(receiptItemFromBlock);
    if (!items.length) {
        return new Document({
            sections: [{
                properties: { page: { margin: PAGE_MARGIN } },
                children: [p('영수증으로 만들 진로 세션이 없습니다.', { size: 22 })]
            }]
        });
    }

    return new Document({
        sections: items.map((item) => {
            const profile = findConsultantProfile(mastersByName, item.displayName)
                || findConsultantProfile(mastersByName, item.consultantKey);
            return {
                properties: { page: { margin: PAGE_MARGIN } },
                children: buildReceiptSection(item, profile, logo)
            };
        })
    });
}

export async function downloadCareerReceiptDoc(model, masters = [], options = {}) {
    const doc = await buildCareerReceiptDocument(model, masters);
    const programName = options.programName || '혁신';
    await blobDownload(doc, fileStamp(`[${programName}][진로컨설팅] 강사비 영수증`, model.periodLabel));
}
