import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseCareerBudgetWorkbook } from '../src/utils/expense/careerBudgetParser.js';
import { parseEmploymentBudgetWorkbook } from '../src/utils/expense/employmentBudgetParser.js';
import { pickRate } from '../src/utils/expense/excelCommon.js';
import { toConsultantMaster, findConsultantProfile, indexConsultantMasters } from '../src/utils/expense/consultantMaster.js';

function toBuffer(sheets) {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

test('career parser aggregates attendance rows and prefers payment-table rates', () => {
    const buffer = toBuffer({
        출석: [
            ['진로개발 출석부 26.10'],
            [],
            ['번호', '상담사', '컨설팅일자', '상담분류', '이름', '학번'],
            [1, '김상담', '10/12 10:30', '진로개발', '홍길동', '20210001'],
            [2, '김상담', '10/12 11:30', '진로개발', '이영희', '20210002'],
            [3, '박강사', '10/13 09:00', '진로개발', '최학생', '20210003'],
            [],
            ['상담사', '1세션당 컨설팅비', '개수', '지급액'],
            ['김상담', 50000, 2, 100000],
            ['박강사', 60000, 1, 60000]
        ]
    });
    const model = parseCareerBudgetWorkbook(buffer, [
        toConsultantMaster({ name: '김상담', uniqueNumber: 'U1', consultingFeePerSession: 1 })
    ]);
    assert.equal(model.periodLabel, '26.10');
    assert.equal(model.interviewBlocks.length, 2);
    const kim = model.interviewBlocks.find((block) => block.displayName.includes('김상담'));
    assert.equal(kim.sessionCount, 2);
    assert.equal(kim.rate, 50000);
    assert.equal(kim.amount, 100000);
    assert.equal(kim.days[0].dayKey, '10/12');
    assert.deepEqual(kim.days[0].times, ['10:30', '11:30']);
    assert.equal(kim.missingProfile, false);
});

test('employment parser splits interview and correction sheets', () => {
    const buffer = toBuffer({
        서류면접: [
            ['취업 서류면접 26.10'],
            ['번호', '상담사', '일자', '상담분류'],
            [1, '한나', '10/20 10:00', '서류면접'],
            [],
            ['상담사', '단가', '개수', '지급액'],
            ['한나', 70000, 1, 70000]
        ],
        '서면첨삭_국문': [
            ['서면첨삭 국문 26.10'],
            ['번호', '상담사', '일자', '상담분류'],
            [1, '이첨삭', '10/21 14:00', '서면첨삭'],
            [],
            ['상담사', '1세션당 컨설팅비', '개수', '지급액'],
            ['이첨삭', 40000, 1, 40000]
        ]
    });
    const model = parseEmploymentBudgetWorkbook(buffer, []);
    assert.equal(model.interviewBlocks.length, 1);
    assert.equal(model.interviewBlocks[0].rate, 70000);
    assert.equal(model.correctionBlocks.korean.length, 1);
    assert.equal(model.correctionBlocks.korean[0].displayName, '이첨삭');
    assert.equal(model.correctionBlocks.english.length, 0);
    assert.equal(model.sessionCount, 2);
});

test('pickRate prefers excel payment rate then master kind rates', () => {
    assert.equal(pickRate({ excelRate: 10, master: { rates: { interview: 99 } }, kind: 'interview' }), 10);
    assert.equal(pickRate({
        excelRate: null,
        master: { rates: { interview: 50, correctionKorean: 40, correctionEnglish: 45 } },
        kind: 'correctionEnglish'
    }), 45);
});

test('consultant master index finds profiles by normalized name', () => {
    const masters = [toConsultantMaster({ name: '김 상담', bankAccount: '국민·111·김상담', placeInterview: 'ZOOM' })];
    const indexed = indexConsultantMasters(masters);
    const found = findConsultantProfile(indexed, '김상담');
    assert.equal(found.placeInterview, 'ZOOM');
    assert.ok(found.bankAccount.includes('국민'));
});
