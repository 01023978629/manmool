#!/usr/bin/env node
/** ============================================================
 * 이전 도구 검증용 가짜 백업 DB 만들기 (contract-fixture-v1)
 * ------------------------------------------------------------
 * 하는 일:
 *   · contract-backend/schema.sql 을 **그대로 실행해** 옛 서버와 같은 모양의 DB 를 만든다
 *   · 계약 여러 건(상태별)·당사자·대금·서명·링크토큰·감사로그를 채운다
 *   · --dirty 를 주면 **일부러 어긋난 줄**을 섞는다
 *     (대금 합계 불일치 · 잠금 후 본문 변조 · 모르는 상태 · 대금 회차 없음 ·
 *      서명 당시 지문 불일치 · 시트 한 칸을 넘는 긴 본문)
 *     → migrate-sqlite-to-sheets.mjs 가 이것을 잡아내는지 확인하는 것이 목적이다
 *
 * 하지 않는 일:
 *   · 사장님의 실제 백업을 흉내 내지 않는다. 여기 이름·번호는 전부 지어낸 것이다.
 *   · 스키마를 여기서 다시 적지 않는다. schema.sql 이 바뀌면 이 파일도 따라 바뀌어야 하므로,
 *     아예 그 파일을 읽어서 쓴다.
 *   · doc_hash 를 손으로 만들지 않는다. contract-backend/src/crypto.mjs 의 함수를 그대로 쓴다 —
 *     이전 도구의 '지문 다시 계산' 검사가 진짜로 맞는지 보려면 옛 서버와 같은 방법이어야 한다.
 *
 * 실행:
 *   node apps-script-contract/tools/make-fixture-db.mjs --out=tools/fixture/clean.db
 *   node apps-script-contract/tools/make-fixture-db.mjs --out=tools/fixture/dirty.db --dirty
 * ============================================================ */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docHash, sha256, hmac, maskPhone } from '../../contract-backend/src/crypto.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, '..', '..', 'contract-backend', 'schema.sql');

/* 시각은 고정한다. 같은 명령을 두 번 돌리면 같은 DB 가 나와야
   "이전 도구가 달라진 것"과 "가짜 자료가 달라진 것"을 구분할 수 있다. */
let T = Date.parse('2026-03-02T01:00:00.000Z');
function tick(minutes) { const s = new Date(T).toISOString(); T += (minutes || 1) * 60000; return s; }

function main() {
  const args = { out: join(HERE, 'fixture', 'clean.db'), dirty: false };
  for (const raw of process.argv.slice(2)) {
    const [k, ...rest] = raw.split('=');
    const v = rest.join('=');
    if (k === '--out') args.out = v;
    else if (k === '--dirty') args.dirty = true;
    else { console.error('모르는 옵션: ' + raw); process.exit(2); }
  }

  const out = resolve(args.out);
  mkdirSync(dirname(out), { recursive: true });
  // 옛 파일이 남아 있으면 줄이 두 배로 쌓여 검증이 무의미해진다.
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(out + suffix)) rmSync(out + suffix);

  const db = new DatabaseSync(out);
  db.exec(readFileSync(SCHEMA, 'utf8'));

  const ctx = { db, dirty: args.dirty };
  // 상태별로 한 건씩. 이전 도구의 '상태별 건수' 표가 뜻을 가지려면 여러 상태가 있어야 한다.
  makeContract(ctx, {
    no: 'MM-2026-0001', title: '둔산동 아파트 32평 전체 리모델링', amount: 38500000,
    customer: { name: '김영희', phone: '01023457788' }, status: 'COMPLETED', signed: true, paidUpTo: 2
  });
  makeContract(ctx, {
    no: 'MM-2026-0002', title: '노은동 욕실 2개 방수·타일', amount: 7200000,
    customer: { name: '박철수', phone: '01098761234' }, status: 'SENT', tokenExpired: true, paidUpTo: 0
  });
  makeContract(ctx, {
    // 이름·제목이 = 로 시작하면 시트에서 수식이 된다. sheetSafe 가 막는지 보는 줄이다.
    no: 'MM-2026-0003', title: '=SUM(A1:A9) 관저동 주방 상판 교체', amount: 3150000,
    customer: { name: '@최민수', phone: '01055667788' }, status: 'DRAFT', paidUpTo: -1
  });
  makeContract(ctx, {
    no: 'MM-2026-0004', title: '유성구 상가 바닥 데코타일', amount: 4800000,
    customer: { name: '이순신', phone: '01033334444' }, status: 'VOID', voided: true, paidUpTo: -1
  });
  makeContract(ctx, {
    no: 'MM-2026-0005', title: '가장동 빌라 도배·장판', amount: 2900000,
    customer: { name: '홍길동', phone: '01077778888' }, status: 'LOCKED', tokenRevoked: true, paidUpTo: 0
  });

  if (args.dirty) {
    // ① 대금 합계가 계약금액과 어긋난 계약 — 보고서가 잡아야 한다
    makeContract(ctx, {
      no: 'MM-2026-0006', title: '대금 합계가 틀린 계약', amount: 10000000,
      customer: { name: '오류나', phone: '01012341234' }, status: 'LOCKED', badPaySum: true, paidUpTo: 0
    });
    // ② 잠금 뒤에 본문이 바뀐 계약 — doc_hash 재계산이 어긋나야 한다
    makeContract(ctx, {
      no: 'MM-2026-0007', title: '잠금 후 본문이 바뀐 계약', amount: 6000000,
      customer: { name: '변조돼', phone: '01043214321' }, status: 'SENT', tamper: true, paidUpTo: 0
    });
    // ③ 모르는 상태 + 대금 회차가 아예 없는 계약
    makeContract(ctx, {
      no: 'MM-2026-0008', title: '상태가 이상한 계약', amount: 1500000,
      customer: { name: '몰라요', phone: '01056785678' }, status: 'WAITING', noPayments: true, paidUpTo: -1
    });
    // ④ 서명할 때 본 지문과 계약의 지문이 다른 계약 — 분쟁이 나면 가장 먼저 문제가 되는 자리다
    makeContract(ctx, {
      no: 'MM-2026-0010', title: '서명 당시 지문이 다른 계약', amount: 8000000,
      customer: { name: '다른문서', phone: '01099998888' }, status: 'COMPLETED', signed: true,
      sigMismatch: true, paidUpTo: 1
    });
    // ⑤ 본문이 시트 한 칸에 안 들어가는 계약 — 이 줄은 아예 옮기지 못한다.
    //    잘라 넣으면 문서 지문이 깨지므로, 보고서의 '옮기지 못한 줄'에 이유와 함께 올라와야 한다.
    makeContract(ctx, {
      no: 'MM-2026-0009', title: '본문이 너무 긴 계약', amount: 5000000,
      customer: { name: '길어요', phone: '01011112222' }, status: 'LOCKED', hugeBody: true, paidUpTo: 0
    });
  }

  // 옮기지 않는 표들 — 보고서의 '옮기지 않은 표' 건수가 0 이 아니어야 확인이 된다
  db.prepare(`INSERT INTO message_templates(id,template_key,channel,title,body_template,buttons_json,version)
              VALUES('mt_1','contract_sign','alimtalk','계약서','#{name}님 계약서입니다','[]',1)`).run();
  db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('SOLAPI_API_KEY','SECRET_DO_NOT_MIGRATE',?)`).run(tick());
  db.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('ALIMTALK_LIVE','0',?)`).run(tick());

  const n = (t) => db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
  console.log('만든 파일: ' + out + (args.dirty ? '  (일부러 어긋난 줄 포함)' : ''));
  console.log('  계약 ' + n('contracts') + ' · 당사자 ' + n('contract_parties') + ' · 대금 ' + n('payments') +
    ' · 링크 ' + n('sign_tokens') + ' · 서명 ' + n('signatures') + ' · 감사로그 ' + n('audit_logs') +
    ' · 동의 ' + n('consents') + ' · OTP ' + n('otp_challenges') + ' · 발송 ' + n('message_deliveries'));
  db.close();
}

/* 계약 한 건과 그에 딸린 것들을 한꺼번에 만든다.
   옛 서버(service.mjs)가 실제로 남기던 순서·이름을 그대로 흉내 낸다. */
function makeContract(ctx, o) {
  const db = ctx.db;
  const id = 'ct_fix' + o.no.slice(-4);
  const created = tick(3);

  const body = {
    site: o.title, customerName: o.customer.name, amount: o.amount,
    scope: ['철거', '도배', '전기'], warranty: '방수 3년 · 급배수 등 설비 2년 · 그 밖의 마감 1년',
    note: '본 계약서는 당사자 확인용이며 법률 자문이 아닙니다.'
  };
  // 시트 한 칸(5만 자)에 못 들어가는 본문. 특약을 잔뜩 붙인 계약을 흉내 낸다.
  if (o.hugeBody) body.special = new Array(2000).fill('특약: 공사 중 발생하는 폐기물은 을이 처리한다. ').join('');
  const locked = o.status !== 'DRAFT';
  // 잠금된 계약만 지문을 갖는다(옛 서버와 같다).
  let hash = locked ? docHash({ amount: o.amount | 0, body }) : null;
  let bodyStored = JSON.stringify(body);
  if (o.tamper) {
    // 잠금 뒤에 본문이 바뀐 상황: 지문은 옛 것 그대로, 본문만 다르다.
    bodyStored = JSON.stringify(Object.assign({}, body, { note: '누군가 잠금 뒤에 이 줄을 고쳤다' }));
  }
  const lockedAt = locked ? tick(5) : null;
  const completedAt = o.status === 'COMPLETED' ? tick(30) : null;

  db.prepare(`INSERT INTO contracts(id,contract_no,title,status,amount,body_snapshot,doc_hash,locked_at,completed_at,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, o.no, o.title, o.status, o.amount | 0, bodyStored, hash, lockedAt, completedAt, created, completedAt || lockedAt || created);

  const pidC = 'pt_' + id + '_c', pidO = 'pt_' + id + '_o';
  db.prepare(`INSERT INTO contract_parties(id,contract_id,role,name,phone_masked,phone_hash,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(pidO, id, 'operator', '만물인테리어', maskPhone('01023978629'), hmac('01023978629'), created);
  db.prepare(`INSERT INTO contract_parties(id,contract_id,role,name,phone_masked,phone_hash,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(pidC, id, 'customer', o.customer.name, maskPhone(o.customer.phone), hmac(o.customer.phone), created);

  audit(db, id, null, 'CONTRACT_CREATED', { contractNo: o.no }, created);

  // 대금 3회차 — 잔금은 나머지 전부(Pure.gs paymentPlan 과 같은 규칙)
  if (!o.noPayments) {
    const down = Math.round(o.amount * 0.5);
    const mid = Math.round(o.amount * 0.4);
    let bal = o.amount - down - mid;
    if (o.badPaySum) bal = bal + 250000;    // ← 일부러 틀린 줄
    const rows = [
      { stage: 'down', label: '계약금', seq: 0, amount: down },
      { stage: 'mid', label: '중도금', seq: 1, amount: mid },
      { stage: 'bal', label: '잔금', seq: 2, amount: bal }
    ];
    rows.forEach((r, i) => {
      const paid = i <= o.paidUpTo;
      const invoicedAt = i <= o.paidUpTo + 1 ? tick(60) : null;
      db.prepare(`INSERT INTO payments(id,contract_id,stage,label,seq,amount,status,invoiced_at,reminded_at,paid_at,created_at)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .run('pay_' + id + '_' + r.stage, id, r.stage, r.label, r.seq, r.amount,
          paid ? 'PAID' : (invoicedAt ? 'INVOICED' : 'PENDING'),
          invoicedAt, (i === 1 && !paid && invoicedAt) ? tick(1440) : null, paid ? tick(30) : null, created);
    });
    audit(db, id, null, 'PAYMENT_SCHEDULE_SET', { rows: rows.length }, created);
    if (o.paidUpTo >= 0) audit(db, id, null, 'PAYMENT_PAID', { stage: 'down' }, tick(2));
  }

  if (locked) audit(db, id, null, 'DOCUMENT_LOCKED', { docHash: hash }, lockedAt);

  // 서명 링크 — 상태에 따라 살아 있는 것/기한 지난 것/취소된 것/이미 쓴 것을 섞는다
  if (o.status !== 'DRAFT') {
    const issuedAt = tick(2);
    const expires = o.tokenExpired
      ? new Date(Date.parse(issuedAt) - 3600 * 1000).toISOString()      // 이미 지난 기한
      : new Date(Date.parse(issuedAt) + 72 * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO sign_tokens(id,contract_id,party_id,purpose,token_hash,expires_at,used_at,revoked_at,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)`)
      .run('tk_' + id + '_s', id, pidC, 'sign', sha256('fake-token-' + id), expires,
        o.signed ? completedAt : null, o.tokenRevoked || o.voided ? tick(1) : null, issuedAt);
    audit(db, id, pidC, 'SIGN_LINK_ISSUED', { purpose: 'sign' }, issuedAt);
    audit(db, id, pidC, 'KAKAO_MESSAGE_QUEUED', { templateKey: 'contract_sign' }, issuedAt);
    audit(db, id, pidC, 'KAKAO_MESSAGE_DELIVERED', { provider: 'solapi' }, tick(1));
    db.prepare(`INSERT INTO message_deliveries(id,contract_id,party_id,template_key,provider,provider_msg_id,status,requested_at,sent_at,delivered_at)
                VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run('md_' + id, id, pidC, 'contract_sign', 'solapi', 'MSG' + id, 'DELIVERED', issuedAt, issuedAt, tick(1));
  }

  if (o.signed) {
    const openedAt = tick(10);
    audit(db, id, pidC, 'SIGN_LINK_OPENED', null, openedAt);
    audit(db, id, pidC, 'IDENTITY_OTP_ISSUED', null, tick(1));
    audit(db, id, pidC, 'IDENTITY_OTP_VERIFIED', null, tick(1));
    audit(db, id, pidC, 'DOCUMENT_VIEWED', null, tick(1));
    db.prepare(`INSERT INTO otp_challenges(id,party_id,code_hash,expires_at,attempts,verified_at,created_at)
                VALUES(?,?,?,?,?,?,?)`).run('otp_' + id, pidC, sha256('000000'), tick(5), 1, tick(1), openedAt);
    for (const key of ['terms', 'privacy', 'esign']) {
      db.prepare(`INSERT INTO consents(id,contract_id,party_id,consent_key,consent_text_hash,agreed_at,ip_hash,ua_hash)
                  VALUES(?,?,?,?,?,?,?,?)`)
        .run('cs_' + id + '_' + key, id, pidC, key, sha256('동의문 ' + key), tick(1), hmac('1.2.3.4'), hmac('UA'));
      audit(db, id, pidC, 'CONSENT_AGREED', { key: key }, tick(1));
    }
    const sig = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    db.prepare(`INSERT INTO signatures(id,contract_id,party_id,image_sha256,image_data,image_ref,doc_hash_seen,signed_at,ip_hash,ua_hash)
                VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run('sg_' + id, id, pidC, sha256(Buffer.from(sig, 'base64')), sig, 'server://sig/' + id,
        o.sigMismatch ? sha256('고객이 본 것은 다른 문서였다') : hash, completedAt, hmac('1.2.3.4'), hmac('UA'));
    audit(db, id, pidC, 'SIGNATURE_SUBMITTED', { imageSha256: sha256(Buffer.from(sig, 'base64')), docHashSeen: hash }, completedAt);
    audit(db, id, null, 'CONTRACT_COMPLETED', null, completedAt);
    // 완료 직후 15분짜리 열람 링크 — 지금은 당연히 기한이 지나 있다
    db.prepare(`INSERT INTO sign_tokens(id,contract_id,party_id,purpose,token_hash,expires_at,used_at,revoked_at,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)`)
      .run('tk_' + id + '_v', id, pidC, 'view', sha256('fake-view-' + id),
        new Date(Date.parse(completedAt) + 15 * 60000).toISOString(), null, null, completedAt);
    audit(db, id, pidC, 'COMPLETED_DOC_ACCESSED', null, tick(3));
  }

  if (o.voided) audit(db, id, null, 'CONTRACT_VOIDED', { reason: '고객 요청으로 취소' }, tick(20));
}

function audit(db, contractId, partyId, event, meta, at) {
  db.prepare(`INSERT INTO audit_logs(contract_id,party_id,event,request_hash,meta_json,at) VALUES(?,?,?,?,?,?)`)
    .run(contractId, partyId, event, hmac('req_' + event + '_' + at), meta ? JSON.stringify(meta) : null, at);
}

main();
