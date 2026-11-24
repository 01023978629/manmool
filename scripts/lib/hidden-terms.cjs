'use strict';
/* 공개 저장소에 글자로 두면 안 되는 낱말 대조기 (2026-11-25)

   대표 규칙: 공개 저장소에는 협력사·거래처 이름, 작업자 이름, 실제 현장의 동·호수 번호·좌표를 두지 않는다.
   그런데 '공개 글에 이 이름이 나오면 실패' 검사는 그 이름을 알아야 한다. 예전 검사들은 이름을 정규식에 글자로 적어
   검사 파일 자체가 이름을 퍼뜨렸다. 이제 낱말마다 sha256 과 글자 수만 두고, 검사할 글을 같은 길이로 잘라
   해시해 대조한다(부분 일치 — 예전 정규식 /이름/ 과 같은 동작). 낱말 목록은 대표 PC 의 비공개 인수인계서에 있다.

   쓰는 곳: tests/recent-cases-*.test.cjs(사례 글), tests/aluminum-screen-case.e2e.cjs, scripts/ensure-area-pages.mjs.
   낱말을 더하려면 sha256(낱말, utf8) 과 Array.from(낱말).length 를 아래 묶음에 더한다 — 낱말 글자는 적지 않는다. */
const crypto = require('node:crypto');

const GROUPS = Object.freeze({
  // 협력사·거래처(발주처·세금계산서 거래처) 이름 11개
  partners: [
    [4, '8779a5ea507da809f7399b7dae8c1d91d07ac683eb0a47b4ce6b66e3b955fa09'], [3, '5c4ea8d8da2d059febed95c62d64d6534ebaf2ccc5a8acc6623761eb3efb6535'],
    [2, 'c49aaa4d80a72ab00716d28d7f0bc58742ae81024ad0fe39496a333f76863ffd'], [5, '42a10059aa578ce3e7533ce5b9b6f303dc3775bafee1c1958898a5e8c94854c5'],
    [3, '22e5d72e037172f22a7e7246531e4f4245a9524c121787dded8844036977de28'], [5, '594be4f0082acea43419e2608c69ba93db24033686b3aaf91661015e1cbd83e4'],
    [3, '037f3c10e93d3b7ac3c953d18c5ed2a38028a1181b66847872c0dda03ca5b59f'], [4, '64ff14333dc6c37adcf93e68b59368abc2082786ba7bd64a9ae615dc8a26080f'],
    [6, 'c40d80f320bb2bb413fe6e59211ef8752587e0063cf84263dd56e54aa76a1fa4'], [3, 'c319d8bc37c36aa18be1aeb096b63e3c4fa3acef0dfa08c3c5328017100c1109'],
    [4, '0eb283ec500e73259edcf44765ae43eaf893ca4857d6da93a7b64a98b88ed102'],
  ],
  // 작업자 이름
  people: [[2, 'caeed60d7bd372f2a5fdb1b52f0e06c6b7be57cfca1988e207830c0b66d7bb6d']],
  // 청주 태산그린 사례(11/13) 작업 메모의 동·호수 번호
  taesanUnit: [[3, '5ef6fdf32513aa7cd11f72beccf132b9224d33f271471fff402742887a171edf'], [4, 'a3513549948fbfecfa1ff0300bf3339f9b1ebff77c9fc831b3c83236a4814d61']],
  // 방충망 사례(10/6) 사진에 보인 이웃 단지 이름과 예전 초안의 길 이름 문구(촬영 현장으로 단정하지 않는다)
  screenNeighbor: [[5, '2d412ebfcadea0b1e2b4064f5176414a932dd354c401b74ca4fef1341b86aea1'], [11, '5c6a72df7e4a34511e31216e5a18a30ab39514875a05bc38776fdc61f0446f3e']],
  // 방충망 사례(10/6) 사진 위치 정보의 대략 좌표
  screenSiteCoords: [[5, '10e9064c7966f722f50a50e131ad9cf6f3ae2665a5e6d63f06f17f623ff159bb'], [6, '9b65ec58457502e05ac1d0a4f12a2548c8f045400d4a9f59c34f602852f78ada']],
});

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

/** text 안에 groups 의 낱말이 있으면 {group, length, index}(index 는 글자 위치), 없으면 null. 낱말 글자는 돌려주지 않는다. */
function findHidden(text, ...groups) {
  const names = groups.length ? groups : Object.keys(GROUPS);
  const chars = Array.from(String(text == null ? '' : text));
  for (const group of names) {
    const entries = GROUPS[group];
    if (!entries) throw new Error(`hidden-terms: 모르는 묶음 ${group}`);
    const byLength = new Map();
    for (const [length, hash] of entries) {
      if (!byLength.has(length)) byLength.set(length, new Set());
      byLength.get(length).add(hash);
    }
    for (const [length, hashes] of byLength) {
      for (let i = 0; i + length <= chars.length; i += 1) {
        if (hashes.has(sha256(chars.slice(i, i + length).join('')))) return { group, length, index: i };
      }
    }
  }
  return null;
}

/** 사람이 읽는 실패 문구(낱말 글자 없이). */
function describeHidden(hit) {
  return hit ? `공개 금지 낱말(${hit.group}, ${hit.length}글자)이 ${hit.index}번째 글자에 있다` : '';
}

module.exports = { GROUPS, findHidden, describeHidden };
