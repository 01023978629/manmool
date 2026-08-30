'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, timingSafeEqual } = require('node:crypto');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'revenue-conversion.js'),
  'utf8'
);

function loadRevenue() {
  const context = { URL, URLSearchParams };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'revenue-conversion.js' });
  return context.ManmulRevenue;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('공식 네이버 예약 URL만 query를 보존하고 fragment를 제거한다', () => {
  const api = loadRevenue();
  assert.doesNotMatch(
    source,
    /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|caches|document)\b|console\s*\./,
    '순수 공개 전환 모듈은 네트워크·저장소·DOM·console을 사용하면 안 된다.'
  );
  assert.deepEqual(Object.keys(api).sort(), [
    'captureLeadMetadata',
    'resolvePublishedLeakCase',
    'sanitizeUtmValue',
    'validateNaverBookingUrl'
  ].sort());
  assert.equal(
    api.validateNaverBookingUrl('  https://booking.naver.com/booking/13/bizes/42?ref=office#ignore  '),
    'https://booking.naver.com/booking/13/bizes/42?ref=office'
  );
  assert.equal(
    api.validateNaverBookingUrl('https://m.booking.naver.com/booking/13/bizes/42?ref=mobile#ignore'),
    'https://m.booking.naver.com/booking/13/bizes/42?ref=mobile'
  );
  for (const raw of [
    'http://booking.naver.com/booking/13/bizes/42',
    'https://booking.naver.com:444/booking/13/bizes/42',
    'https://user:pass@booking.naver.com/booking/13/bizes/42',
    'https://booking.naver.com.evil.example/booking/13/bizes/42',
    'https://booking.naver.com/',
    'https://m.booking.naver.com.evil.example/booking/13/bizes/42',
    'https://naver.com/booking/13/bizes/42',
    '',
    null
  ]) assert.equal(api.validateNaverBookingUrl(raw), null, '공식 네이버 예약 URL 경계 위반');
});

test('CTA/UTM 메타데이터는 pathname과 허용 문자만 보존한다', () => {
  const api = loadRevenue();
  const publishedEntry = {
    slug: 'apartment-upper-lower-rain-pipe-repair',
    title: '공개 누수 사례',
    service: 'leak',
    published: true
  };
  const caseIndex = { version: 1, cases: [
    publishedEntry,
    { slug: 'draft-leak-case', title: '비공개 초안', service: 'leak', published: false }
  ] };
  const published = api.resolvePublishedLeakCase(publishedEntry.slug, caseIndex);
  assert.deepEqual(plain(published), {
    slug: 'apartment-upper-lower-rain-pipe-repair',
    title: '공개 누수 사례'
  });
  assert.equal(api.resolvePublishedLeakCase('draft-leak-case', caseIndex), null);
  assert.equal(api.resolvePublishedLeakCase(publishedEntry.slug, {
    version: 1,
    cases: [publishedEntry, publishedEntry]
  }), null);
  assert.equal(api.resolvePublishedLeakCase(publishedEntry.slug, {
    version: 2,
    cases: [publishedEntry]
  }), null);
  assert.equal(api.resolvePublishedLeakCase(publishedEntry.slug, {
    version: 1,
    cases: [{ ...publishedEntry, service: 'interior' }]
  }), null);

  assert.deepEqual(
    plain(api.captureLeadMetadata(
      {
        pathname: '/leak.html',
        search: '?utm_source=Naver%20Blog&utm_medium=organic&utm_campaign=rainy-2026&x=010-1234-5678'
      },
      'leak-inquiry-submit',
      published
    )),
    {
      sourcePage: '/leak.html',
      ctaId: 'leak-inquiry-submit',
      utmSource: 'Naver Blog',
      utmMedium: 'organic',
      utmCampaign: 'rainy-2026',
      referenceCase: 'apartment-upper-lower-rain-pipe-repair'
    }
  );
  assert.deepEqual(
    plain(api.captureLeadMetadata(
      { pathname: '/office.html', search: '?utm_source=safe' },
      'INVALID CTA',
      null
    )),
    { sourcePage: '/office.html', ctaId: 'unknown-cta', utmSource: 'safe' }
  );
  assert.deepEqual(
    plain(api.captureLeadMetadata(
      { pathname: 'https://invalid.example/path?private=value', search: '' },
      'office-pilot-submit',
      null
    )),
    { sourcePage: '/', ctaId: 'office-pilot-submit' }
  );
  assert.equal(api.sanitizeUtmValue('x'.repeat(81)), null);
  assert.equal(api.sanitizeUtmValue('name@example.com'), null);
});

test('국내 전화번호처럼 보이는 값은 세 UTM 필드 모두에서 제외한다', () => {
  const api = loadRevenue();
  for (const phoneLike of ['010-1234-5678', '01012345678', '02-123-4567', '070 1234 5678']) {
    assert.equal(api.sanitizeUtmValue(phoneLike), null, '전화형 UTM을 허용하면 안 된다');
    for (const param of ['utm_source', 'utm_medium', 'utm_campaign']) {
      const blocked = api.captureLeadMetadata(
        { pathname: '/leak.html', search: '?' + param + '=' + encodeURIComponent(phoneLike) },
        'leak-inquiry-submit',
        null
      );
      assert.deepEqual(plain(blocked), {
        sourcePage: '/leak.html',
        ctaId: 'leak-inquiry-submit'
      });
    }
  }
});

test('안심번호·수신자부담·대표번호는 전체값과 내부값 모두 세 UTM 필드에서 제외한다', () => {
  const api = loadRevenue();
  const phoneLikeValues = [
    '0507-1234-5678',
    '050-1234-5678',
    '080-123-4567',
    '1588-1234'
  ];
  for (const phoneLike of phoneLikeValues) {
    for (const candidate of [phoneLike, 'campaign ' + phoneLike + ' source']) {
      assert.equal(api.sanitizeUtmValue(candidate), null, '전화형 UTM을 허용하면 안 된다');
      for (const param of ['utm_source', 'utm_medium', 'utm_campaign']) {
        const blocked = api.captureLeadMetadata(
          { pathname: '/leak.html', search: '?' + param + '=' + encodeURIComponent(candidate) },
          'leak-inquiry-submit',
          null
        );
        assert.deepEqual(plain(blocked), {
          sourcePage: '/leak.html',
          ctaId: 'leak-inquiry-submit'
        });
      }
    }
  }
});

test('네이버 예약 설정은 계정 승인 전 정확히 비활성 상태다', () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'config.json'),
    'utf8'
  ));
  assert.deepEqual(Object.keys(config.naver).sort(), ['_help', 'bookingUrl', 'ready']);
  assert.equal(config.naver.ready, false);
  assert.equal(config.naver.bookingUrl, '');
  assert.equal(
    config.naver._help,
    '대표가 네이버 스마트플레이스에서 만든 공식 예약 URL을 입력하고 검증한 뒤에만 ready를 true로 바꾸세요. false이거나 URL이 유효하지 않으면 공개 예약 버튼은 숨겨지고 상담 폼과 전화만 제공됩니다.'
  );

  const invariant = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'public-config-invariants.json'),
    'utf8'
  ));
  assert.deepEqual(Object.keys(invariant).sort(), ['formsAccessKeySha256', 'schemaVersion']);
  assert.equal(invariant.schemaVersion, 1);
  assert.match(invariant.formsAccessKeySha256, /^[a-f0-9]{64}$/);
  const baselineDigest = Buffer.from(invariant.formsAccessKeySha256, 'hex');
  assert.equal(baselineDigest.length, 32);
  assert.equal(typeof config.forms.accessKey, 'string', '공개 form identifier 형식이 바뀌었습니다.');
  const currentDigest = createHash('sha256').update(config.forms.accessKey, 'utf8').digest();
  assert.equal(
    timingSafeEqual(currentDigest, baselineDigest),
    true,
    '기존 Web3Forms public form identifier가 변경되었습니다.'
  );
});
