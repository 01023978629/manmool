'use strict';
/* 문의 접수함 순수 로직(apps-script-lead-inbox/LeadInboxPure.gs) 단위 검사.
   서버(Code.gs)는 이 함수들의 결과를 저장만 하므로, 여기서 검증·정규화·상태 전이를 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script-lead-inbox', 'LeadInboxPure.gs'), 'utf8');
const context = { module: { exports: {} } };
context.exports = context.module.exports;
vm.runInNewContext(source, context, { filename: 'LeadInboxPure.gs' });
const pure = context.module.exports;
// vm 컨텍스트의 배열·객체는 프로토타입이 달라 deepEqual 이 실패한다 — JSON 모양으로 비교한다.
const plain = (value) => JSON.parse(JSON.stringify(value));
const LEAD_ID = '3f2c9b1e-6d4a-4c8b-9e1f-0a2b3c4d5e6f';
const REQUEST_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function payload(extra) {
  return Object.assign({ leadId: LEAD_ID, name: '검사 손님', phone: '010-1234-5678', privacyConsent: true, type: '아파트', region: '대전 서구' }, extra || {});
}

test('상태와 전이 표는 승인이 종착이고 거절만 보류로 되살아난다', () => {
  assert.deepEqual(plain(pure.LEAD_STATUSES), ['신규', '승인', '보류', '거절']);
  assert.deepEqual(plain(pure.LEAD_TRANSITIONS), { '신규': ['승인', '보류', '거절'], '보류': ['승인', '거절'], '거절': ['보류'], '승인': [] });
  assert.equal(pure.leadPureCanTransition_('신규', '승인'), true);
  assert.equal(pure.leadPureCanTransition_('승인', '보류'), false);
  assert.equal(pure.leadPureCanTransition_('거절', '보류'), true);
  assert.equal(pure.leadPureCanTransition_('거절', '승인'), false);
  assert.equal(pure.leadPureCanTransition_('없음', '승인'), false);
  assert.equal(pure.leadPureCanTransition_('신규', '신규'), false);
});

test('텍스트 정규화는 제어문자를 지우고 수식 첫 글자를 글자로 고정하며 길이를 자른다', () => {
  assert.equal(pure.leadPureText_('  a bc  ', 10), 'a bc');
  assert.equal(pure.leadPureText_('a' + String.fromCharCode(7) + 'b', 10), 'ab');
  assert.equal(pure.leadPureText_('=SUM(A1)', 20), "'=SUM(A1)");
  assert.equal(pure.leadPureText_('+82 10', 20), "'+82 10");
  assert.equal(pure.leadPureText_('-메모', 20), "'-메모");
  assert.equal(pure.leadPureText_('@mention', 20), "'@mention");
  assert.equal(pure.leadPureText_('보통 글', 20), '보통 글');
  assert.equal(pure.leadPureText_('12345678', 5), '12345');
  assert.equal(pure.leadPureText_(null, 5), '');
  assert.equal(pure.leadPureText_(undefined, 5), '');
  assert.equal(pure.leadPureText_(42, 5), '42');
});

test('전화번호는 숫자만 남겨 0으로 시작하는 9~11자리만 받고 하이픈으로 다시 쓴다', () => {
  assert.equal(pure.leadPureDigits_('010-1234-5678'), '01012345678');
  assert.equal(pure.leadPureDigits_('+82 10 1234 5678'), '01012345678');
  assert.equal(pure.leadPureDigits_('042-123-4567'), '0421234567');
  assert.equal(pure.leadPureDigits_('02-123-4567'), '021234567');
  assert.equal(pure.leadPureDigits_('1234'), '');
  assert.equal(pure.leadPureDigits_('12345678901'), '');
  assert.equal(pure.leadPureDigits_(''), '');
  assert.equal(pure.leadPureFormatPhone_('01012345678'), '010-1234-5678');
  assert.equal(pure.leadPureFormatPhone_('0421234567'), '042-123-4567');
  assert.equal(pure.leadPureFormatPhone_('021234567'), '02-123-4567');
});

test('접수 정규화는 UUID·전화·동의를 요구하고 필드 밖 값을 extra JSON 에 보존한다', () => {
  assert.deepEqual(plain(pure.leadPureNormalizeCreate_(payload({ leadId: 'not-a-uuid' }))), { ok: false, error: 'invalid_lead_id', field: 'leadId' });
  assert.deepEqual(plain(pure.leadPureNormalizeCreate_(payload({ phone: '123' }))), { ok: false, error: 'invalid_phone', field: 'phone' });
  assert.deepEqual(plain(pure.leadPureNormalizeCreate_(payload({ privacyConsent: false }))), { ok: false, error: 'consent_required', field: 'privacyConsent' });
  assert.equal(pure.leadPureNormalizeCreate_(payload({ privacyConsent: 'true' })).ok, false);
  assert.equal(pure.leadPureNormalizeCreate_(payload({ privacyConsent: undefined, consent: true })).ok, true);
  assert.equal(pure.leadPureNormalizeCreate_(null).ok, false);
  assert.equal(pure.leadPureNormalizeCreate_([]).ok, false);

  const result = pure.leadPureNormalizeCreate_(payload({
    leadId: LEAD_ID.toUpperCase(), works: ['도배', '장판', ''], symptoms: ['천장 얼룩'], inquiryPurpose: '견적',
    preferredVisitDate: '2026-09-10', preferredVisitWindow: '오전', utmSource: 'naver', utmMedium: 'cpc',
    emailDelivered: true, message: '본문', memo: '=1+1', customField: 'x'.repeat(600), emptyField: '', fn: () => 1, submittedAt: 'now',
  }));
  assert.equal(result.ok, true);
  const row = result.row;
  assert.equal(row.leadId, LEAD_ID);
  assert.equal(row.name, '검사 손님');
  assert.equal(row.phone, '010-1234-5678');
  assert.equal(row.service, '인테리어');
  assert.equal(row.works, '도배, 장판');
  assert.equal(row.symptoms, '천장 얼룩');
  assert.equal(row.purpose, '견적');
  assert.equal(row.visit, '2026-09-10 · 오전');
  assert.equal(row.utm, 'naver / cpc');
  assert.equal(row.emailDelivered, 'Y');
  assert.equal(row.memo, "'=1+1");
  assert.equal(row.message, '본문');
  const extra = JSON.parse(row.extra);
  assert.deepEqual(Object.keys(extra), ['customField']);
  assert.equal(extra.customField.length, 500);
  assert.deepEqual(Object.keys(row).sort(), ['area', 'budget', 'ctaId', 'emailDelivered', 'extra', 'leadId', 'live', 'memo', 'message', 'movein', 'name', 'phone', 'purpose', 'region', 'scope', 'service', 'source', 'sourcePage', 'symptoms', 'type', 'utm', 'visit', 'works']);
});

test('서비스 구분은 누수 유형·누수 페이지·관리사무소 파일럿을 가르고 나머지는 인테리어다', () => {
  assert.equal(pure.leadPureNormalizeCreate_(payload({ type: '누수' })).row.service, '누수');
  assert.equal(pure.leadPureNormalizeCreate_(payload({ source: 'leak-page' })).row.service, '누수');
  assert.equal(pure.leadPureNormalizeCreate_(payload({ source: 'office-pilot' })).row.service, '관리사무소');
  assert.equal(pure.leadPureNormalizeCreate_(payload({ source: 'index' })).row.service, '인테리어');
  assert.equal(pure.leadPureNormalizeCreate_(payload({ name: '', emailDelivered: 'Y' })).row.name, '(이름 없음)');
  assert.equal(pure.leadPureNormalizeCreate_(payload({ emailDelivered: 'Y' })).row.emailDelivered, 'N');
});

test('접수번호는 LD-날짜-4자리이며 1만 건을 넘으면 자릿수만 늘어난다', () => {
  assert.equal(pure.leadPureReceiptNo_('20260903', 1), 'LD-20260903-0001');
  assert.equal(pure.leadPureReceiptNo_('20260903', 42), 'LD-20260903-0042');
  assert.equal(pure.leadPureReceiptNo_('20260903', 12345), 'LD-20260903-12345');
  assert.equal(pure.leadPureReceiptNo_('20260903', 0), 'LD-20260903-0001');
  assert.equal(pure.leadPureReceiptNo_('20260903', 'x'), 'LD-20260903-0001');
});

test('판정 정규화는 UUID 둘과 새 상태를 요구하고 거절은 메모가 있어야 한다', () => {
  const base = { leadId: LEAD_ID, requestId: REQUEST_ID, decision: '승인', memo: ' 진행 ' };
  const ok = pure.leadPureNormalizeDecision_(base);
  assert.deepEqual(plain(ok), { ok: true, value: { leadId: LEAD_ID, requestId: REQUEST_ID, decision: '승인', memo: '진행' } });
  assert.equal(pure.leadPureNormalizeDecision_({ ...base, leadId: 'x' }).error, 'invalid_lead_id');
  assert.equal(pure.leadPureNormalizeDecision_({ ...base, requestId: '' }).error, 'invalid_request_id');
  assert.equal(pure.leadPureNormalizeDecision_({ ...base, decision: '신규' }).error, 'invalid_decision');
  assert.equal(pure.leadPureNormalizeDecision_({ ...base, decision: '완료' }).error, 'invalid_decision');
  assert.equal(pure.leadPureNormalizeDecision_({ ...base, decision: '거절', memo: '  ' }).error, 'memo_required');
  assert.equal(pure.leadPureNormalizeDecision_({ ...base, decision: '거절', memo: '예산 불일치' }).ok, true);
  assert.equal(pure.leadPureNormalizeDecision_({ ...base, memo: 'm'.repeat(600) }).value.memo.length, 500);
  assert.equal(pure.leadPureNormalizeDecision_(null).ok, false);
});

test('관리 비밀번호 형식은 8~64자, 공백 없음이다', () => {
  assert.equal(pure.leadPureAdminCodeShape_('abcdefgh'), true);
  assert.equal(pure.leadPureAdminCodeShape_('a'.repeat(64)), true);
  assert.equal(pure.leadPureAdminCodeShape_('a'.repeat(65)), false);
  assert.equal(pure.leadPureAdminCodeShape_('abcdefg'), false);
  assert.equal(pure.leadPureAdminCodeShape_('abcd efgh'), false);
  assert.equal(pure.leadPureAdminCodeShape_('abcd' + String.fromCharCode(9) + 'efgh'), false);
  assert.equal(pure.leadPureAdminCodeShape_(null), false);
  assert.equal(pure.leadPureAdminCodeShape_(12345678), true);
});

test('순수 파일은 Apps Script 서비스(Sheets·Cache·Properties·Lock)를 건드리지 않는다', () => {
  assert.equal(/\b(?:SpreadsheetApp|CacheService|PropertiesService|LockService|UrlFetchApp|Utilities)\b/.test(source), false);
});
