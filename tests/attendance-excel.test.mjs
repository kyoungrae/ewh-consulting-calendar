import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
    parseAttendanceWorkbook,
    enrichAttendanceSessions,
    buildExpensePreview
} from '../src/utils/attendanceExcel.js';
import { amountToKorean } from '../src/utils/expenseFormat.js';

function workbookBuffer(rows, sheetName = '출석') {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

test('parses tabular career attendance sheets and builds detail/receipt previews', () => {
    const buffer = workbookBuffer([
        ['일자', '시간', '구분', '컨설턴트명', '학생명', '금액'],
        ['2026-03-02', '10:00', '진로개발', '김테스트', '홍길동', 50000],
        ['2026-03-03', '11:00', '진로연계', '김테스트', '이영희', 50000],
        ['2026-03-03', '13:00', '진로개발', '박강사', '', 60000]
    ]);
    const sessions = parseAttendanceWorkbook(buffer, 'career', '진로.xlsx');
    assert.equal(sessions.length, 3);
    assert.equal(sessions[0].consultantName, '김테스트');
    assert.equal(sessions[0].amountFromFile, 50000);

    const enriched = enrichAttendanceSessions(sessions, [], []);
    const preview = buildExpensePreview(enriched);
    assert.equal(preview.totals.count, 3);
    assert.equal(preview.totals.amount, 160000);
    assert.equal(preview.detailRows[0].sourceLabel, '진로');
    assert.equal(preview.receiptRows.length, 2);
    const kim = preview.receiptRows.find((row) => row.consultantName === '김테스트');
    assert.equal(kim.count, 2);
    assert.equal(kim.careerCount, 2);
});

test('parses employment attendance and skips cancelled rows in preview', () => {
    const buffer = workbookBuffer([
        ['날짜', '강사', '유형', '취소여부', '강사료'],
        ['2026-04-01', '한나', '서류면접', '-', 70000],
        ['2026-04-02', '한나', '서류면접', '취소', 70000]
    ]);
    const sessions = parseAttendanceWorkbook(buffer, 'employment', '취업.xlsx');
    assert.equal(sessions.length, 2);
    const preview = buildExpensePreview(enrichAttendanceSessions(sessions, [], []));
    assert.equal(preview.totals.count, 1);
    assert.equal(preview.totals.employmentCount, 1);
    assert.equal(preview.totals.amount, 70000);
});

test('amountToKorean renders formal Korean currency wording', () => {
    assert.equal(amountToKorean(0), '영원');
    assert.equal(amountToKorean(10000), '일만원정');
    assert.equal(amountToKorean(123450), '십이만삼천사백오십원정');
});
