import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEmploymentBudgetWorkbook } from '../src/utils/expense/employmentBudgetParser.js';
import {
    moneyLine,
    periodMonthLabel,
    periodRangeLabel,
    formatBirthDate,
    dayLines
} from '../src/utils/expense/docCommon.js';
import { buildEmploymentExpenseDocument } from '../src/utils/expense/employmentExpenseDoc.js';
import { blocksToItems } from '../src/utils/expense/employmentReceiptDoc.js';
import {
    toConsultantMaster,
    indexConsultantMasters,
    instructorSortName
} from '../src/utils/expense/consultantMaster.js';

const dir = dirname(fileURLToPath(import.meta.url));
const employmentFile = join(dir, 'fixtures/expense/employment-attendance-26.10.xlsx');

test('employment doc helpers match sample wording', () => {
    assert.equal(moneyLine(7, 80000, 560000), '총7세션*세션당80,000원= 560,000원');
    assert.equal(moneyLine(7, 80000, 560000, { spaced: true }), '총 7세션*세션당 80,000원= 560,000원');
    assert.equal(periodMonthLabel('26.10'), '26년 10월');
    assert.equal(periodRangeLabel('26.10'), '26년 10/1~10/31');
    assert.equal(formatBirthDate('1975-09-13'), '75.09.13');
    assert.deepEqual(
        dayLines([{ dayKey: '10/12', times: ['11:00', '12:00'], count: 2 }]),
        ['10/12 – 11:00, 12:00 (2세션)']
    );
});

test('employment expense document mirrors sample section structure', async () => {
    const model = parseEmploymentBudgetWorkbook(readFileSync(employmentFile));
    assert.ok(model.rateCriteria.some((row) => row.name.includes('강') && row.rate === 80000));
    assert.ok(model.rateCriteria.some((row) => row.remark.includes('서면첨삭')));

    const doc = buildEmploymentExpenseDocument(model, { programName: '혁신' });
    const { Packer } = await import('docx');
    const buffer = await Packer.toBuffer(doc);
    const text = buffer.toString('utf8');
    // document.xml is compressed in docx zip; still often contains plain strings uncompressed in some packs,
    // so also assert via model-derived expected phrases present in XML by unzipping.
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /취업컨설팅 강사비 \(26년 10월\) 지급에 관한 사항입니다/);
    assert.match(xml, /강사별 강사비 지급 기준/);
    assert.match(xml, /서류면접 컨설팅/);
    assert.match(xml, /서면첨삭\] 26년10\/1~10\/31/);
    assert.match(xml, /총7세션\*세션당80,000원= 560,000원/);
    assert.match(xml, /\(국문\)/);
    assert.match(xml, /\(영문\)/);
    assert.match(xml, /총17세션\*세션당20,000원= 340,000원/);
    void text;
});

test('employment receipts are ordered by instructor name (가나다)', () => {
    const masters = [
        toConsultantMaster({ name: '한 나', role: 'consultant', uniqueNumber: 'A1' }),
        toConsultantMaster({ name: '강 진', role: 'consultant', uniqueNumber: 'A2' }),
        toConsultantMaster({ name: '김동은', role: 'consultant', uniqueNumber: 'A3' })
    ];
    const mastersByName = indexConsultantMasters(masters);
    const model = parseEmploymentBudgetWorkbook(readFileSync(employmentFile), masters);
    const items = blocksToItems(model, mastersByName);
    const sortKey = (item) => instructorSortName(mastersByName, item.displayName, item.consultantKey);
    const firstOf = (name) => items.findIndex((item) => sortKey(item) === name);
    assert.ok(firstOf('강 진') >= 0);
    assert.ok(firstOf('김동은') >= 0);
    assert.ok(firstOf('한 나') >= 0);
    assert.ok(firstOf('강 진') < firstOf('김동은'));
    assert.ok(firstOf('김동은') < firstOf('한 나'));
});
