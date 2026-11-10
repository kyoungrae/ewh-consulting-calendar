import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCareerBudgetWorkbook } from '../src/utils/expense/careerBudgetParser.js';
import { parseEmploymentBudgetWorkbook } from '../src/utils/expense/employmentBudgetParser.js';

const dir = dirname(fileURLToPath(import.meta.url));
const careerFile = join(dir, 'fixtures/expense/career-attendance-26.10.xlsx');
const employmentFile = join(dir, 'fixtures/expense/employment-attendance-26.10.xlsx');

test('real career attendance fixture matches payment totals', () => {
    const model = parseCareerBudgetWorkbook(readFileSync(careerFile));
    assert.equal(model.periodLabel, '26.10');
    assert.equal(model.sessionCount, 18);
    assert.equal(model.totalAmount, 1100000);
    assert.equal(model.interviewBlocks.length, 3);
    const kim = model.interviewBlocks.find((block) => block.displayName === '김나영');
    assert.equal(kim.sessionCount, 9);
    assert.equal(kim.rate, 60000);
    assert.equal(kim.amount, 540000);
});

test('real employment attendance fixture splits interview and correction languages', () => {
    const model = parseEmploymentBudgetWorkbook(readFileSync(employmentFile));
    assert.equal(model.periodLabel, '26.10');
    assert.equal(model.interviewBlocks.reduce((sum, block) => sum + block.sessionCount, 0), 97);
    assert.equal(model.interviewBlocks.reduce((sum, block) => sum + block.amount, 0), 7030000);
    assert.equal(model.correctionBlocks.korean.reduce((sum, block) => sum + block.sessionCount, 0), 40);
    assert.equal(model.correctionBlocks.english.reduce((sum, block) => sum + block.sessionCount, 0), 4);
    assert.equal(model.correctionBlocks.english[0].displayName, '성지우');
    assert.equal(model.correctionBlocks.english[0].rate, 25000);
    assert.equal(model.sessionCount, 141);
    assert.equal(model.totalAmount, 7930000);
});
