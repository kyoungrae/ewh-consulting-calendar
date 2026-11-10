import { Document, Paragraph, AlignmentType, Table, WidthType } from 'docx';
import {
    PAGE_MARGIN,
    p,
    run,
    moneyLine,
    dayLines,
    periodRangeLabel,
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

const CONTENT_ORDER = {
    '취업컨설팅(서류면접)': 0,
    '취업컨설팅(서면첨삭(국문))': 1,
    '취업컨설팅(서면첨삭(영문))': 2
};

/** 출석부 블록 → 영수증 항목 (가나다·내용 순). 테스트/미리보기에서도 재사용. */
export function blocksToItems(model, mastersByName) {
    const periodSchedule = periodRangeLabel(model.periodLabel);
    const items = [];
    // 지급액·강의일시: 출석부 집계 블록에서만 채움
    for (const block of model.interviewBlocks || []) {
        items.push({
            content: '취업컨설팅(서류면접)',
            paymentLine: moneyLine(block.sessionCount, block.rate, block.amount, { spaced: true }),
            scheduleLines: dayLines(block.days),
            displayName: block.displayName,
            consultantKey: block.consultant,
            missingProfile: block.missingProfile,
            placeKey: 'interview'
        });
    }
    // 서면첨삭: 지급액은 압축 표기, 강의일시는 월 기간(예: 26년 10/1~10/31)
    for (const block of model.correctionBlocks?.korean || []) {
        items.push({
            content: '취업컨설팅(서면첨삭(국문))',
            paymentLine: moneyLine(block.sessionCount, block.rate, block.amount),
            scheduleLines: [periodSchedule],
            displayName: block.displayName,
            consultantKey: block.consultant,
            missingProfile: block.missingProfile,
            placeKey: 'correction'
        });
    }
    for (const block of model.correctionBlocks?.english || []) {
        items.push({
            content: '취업컨설팅(서면첨삭(영문))',
            paymentLine: moneyLine(block.sessionCount, block.rate, block.amount),
            scheduleLines: [periodSchedule],
            displayName: block.displayName,
            consultantKey: block.consultant,
            missingProfile: block.missingProfile,
            placeKey: 'correction'
        });
    }
    // 강사 가나다순 (동일 강사는 서류면접 → 첨삭 국문 → 영문)
    return items.sort((a, b) => {
        const byName = compareInstructorNames(
            instructorSortName(mastersByName, a.displayName, a.consultantKey),
            instructorSortName(mastersByName, b.displayName, b.consultantKey)
        );
        if (byName) return byName;
        return (CONTENT_ORDER[a.content] ?? 9) - (CONTENT_ORDER[b.content] ?? 9);
    });
}

function buildReceiptSection(item, profile, logo) {
    // 장소·성명·생년월일·핸드폰·소속·주소·통장: 회원관리 프로필
    const bank = formatBankAccount(profile?.bankAccount);
    const place = item.placeKey === 'correction'
        ? (profile?.placeCorrection || profile?.place || '온라인 접수')
        : (profile?.placeInterview || profile?.place || '온라인 ZOOM');
    const name = profile?.name || item.displayName;
    const unique = profile?.uniqueNumber ? ` (${profile.uniqueNumber})` : '';
    const nameLine = `${name}${unique}`;
    const affiliationAddress = [profile?.affiliation, profile?.address].filter(Boolean).join(' / ') || '-';
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

    // 지급액·강의일시(item.*)는 출석부, 나머지 인적/계좌는 회원관리
    const rows = [
        labelValueRow('내       용', item.content),
        labelValueRow('지  급  액', item.paymentLine),
        labelValueRow('강 의 일 시', item.scheduleLines.length ? item.scheduleLines : ['-']),
        labelValueRow('장       소', place),
        labelValueRow('성       명\n(고유번호)', nameLine),
        labelValueRow('생년월일', formatBirthDate(profile?.birthDate)),
        labelValueRow('핸드폰번호', profile?.tel || '-'),
        labelValueRow('소속 및 주소', affiliationAddress),
        labelValueRow('통 장 번 호', bankAccountLines(bank))
    ];

    return [
        p('[취업컨설팅]', { bold: true, size: 28, align: AlignmentType.CENTER, spacing: { after: 40 } }),
        p('강사비 지급내역', { bold: true, size: 28, align: AlignmentType.CENTER, spacing: { after: 160 } }),
        ...warning,
        new Table({ width: { size: 9200, type: WidthType.DXA }, rows }),
        logoParagraph(logo)
    ];
}

export async function buildEmploymentReceiptDocument(model, masters = []) {
    const logo = await loadLogoImage();
    const mastersByName = indexConsultantMasters(masters);
    const items = blocksToItems(model, mastersByName);
    if (!items.length) {
        return new Document({
            sections: [{
                properties: { page: { margin: PAGE_MARGIN } },
                children: [p('영수증으로 만들 취업 세션이 없습니다.', { size: 22 })]
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

export async function downloadEmploymentReceiptDoc(model, masters = [], options = {}) {
    const doc = await buildEmploymentReceiptDocument(model, masters);
    const programName = options.programName || '혁신';
    await blobDownload(doc, fileStamp(`[${programName}][취업컨설팅] 강사비 영수증`, model.periodLabel));
}
