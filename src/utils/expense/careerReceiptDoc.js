import { Document, Paragraph, AlignmentType, Table, WidthType } from 'docx';
import {
    RECEIPT_SECTION,
    p,
    run,
    moneyLine,
    dayLines,
    formatBirthDate,
    bankAccountLines,
    labelValueRow,
    loadLogoImage,
    logoParagraph,
    blobDownload,
    fileStamp
} from './docCommon.js';
import {
    findConsultantProfile,
    formatBankAccount,
    indexConsultantMasters,
    instructorSortName,
    compareInstructorNames
} from './consultantMaster.js';

function receiptItemFromBlock(block) {
    return {
        content: '진로컨설팅(진로개발)',
        // 지급액·강의일시: 출석부
        paymentLine: moneyLine(block.sessionCount, block.rate, block.amount, { spaced: true }),
        scheduleLines: dayLines(block.days),
        displayName: block.displayName,
        consultantKey: block.consultant,
        missingProfile: block.missingProfile
    };
}

function buildReceiptSection(item, profile, logo) {
    // 장소·성명·생년월일·핸드폰·소속·주소·통장: 회원관리
    const bank = formatBankAccount(profile?.bankAccount);
    const place = profile?.placeInterview || profile?.place || '온라인 ZOOM';
    const name = profile?.name || item.displayName;
    const unique = profile?.uniqueNumber ? ` (${profile.uniqueNumber})` : '';
    const warning = !profile
        ? [new Paragraph({
            spacing: { after: 80 },
            children: [run('⚠ 회원관리에 해당 강사 정보가 없습니다. 성명·계좌 등을 등록해 주세요.', {
                bold: true,
                size: 18,
                color: 'B45309'
            })]
        })]
        : [];

    const rows = [
        labelValueRow('내       용', item.content),
        labelValueRow('지  급  액', item.paymentLine),
        labelValueRow('강 의 일 시', item.scheduleLines.length ? item.scheduleLines : ['-']),
        labelValueRow('장       소', place),
        labelValueRow('성       명\n(고유번호)', `${name}${unique}`),
        labelValueRow('생년월일', formatBirthDate(profile?.birthDate)),
        labelValueRow('핸드폰번호', profile?.tel || '-'),
        labelValueRow('소속 및 주소', [profile?.affiliation, profile?.address].filter(Boolean).join(' / ') || '-'),
        labelValueRow('통 장 번 호', bankAccountLines(bank))
    ];

    return [
        p('[진로컨설팅]', { bold: true, size: 28, align: AlignmentType.CENTER, spacing: { after: 40 } }),
        p('강사비 지급내역', { bold: true, size: 32, align: AlignmentType.CENTER, spacing: { after: 240 } }),
        ...warning,
        new Table({ width: { size: 9200, type: WidthType.DXA }, rows }),
        logoParagraph(logo)
    ];
}

export async function buildCareerReceiptDocument(model, masters = []) {
    const logo = await loadLogoImage();
    const mastersByName = indexConsultantMasters(masters);
    const items = (model.interviewBlocks || [])
        .map(receiptItemFromBlock)
        .sort((a, b) => compareInstructorNames(
            instructorSortName(mastersByName, a.displayName, a.consultantKey),
            instructorSortName(mastersByName, b.displayName, b.consultantKey)
        ));
    if (!items.length) {
        return new Document({
            sections: [{
                ...RECEIPT_SECTION,
                children: [p('영수증으로 만들 진로 세션이 없습니다.', { size: 22 })]
            }]
        });
    }

    return new Document({
        sections: items.map((item) => {
            const profile = findConsultantProfile(mastersByName, item.displayName)
                || findConsultantProfile(mastersByName, item.consultantKey);
            return {
                ...RECEIPT_SECTION,
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
