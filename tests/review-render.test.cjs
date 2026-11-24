'use strict';
/* 대문 후기 칸(js/main.js renderReviews) — 손님이 쓴 후기 글·이름·현장이 태그로 읽히지 않는가 (2026-11-25).

   후기는 review.html 로 받은 손님 글을 대표가 data/site.json reviews 에 옮긴 것이다. 예전 renderReviews 는
   text·name·space 를 innerHTML 에 그대로 넣었다 — 후기에 '<' 나 따옴표가 있으면 화면이 깨지고, 태그가 실행될 수 있었다.
   브라우저 없이 main.js 를 node:vm 으로 그대로 읽어 함수만 부른다(사본 금지). 시험 이름·글은 모두 가상이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function load() {
  const nodes = {
    reviews: { hidden: true },
    reviewsGrid: { innerHTML: '' },
  };
  const document = {
    addEventListener() {},
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const context = { document, console, setTimeout, clearTimeout, URLSearchParams, location: { search: '', hash: '' } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'js/main.js' });
  return { renderReviews: context.renderReviews, nodes };
}

test('후기가 없으면 칸을 숨긴다(허위 후기 미노출)', () => {
  const { renderReviews, nodes } = load();
  nodes.reviews.hidden = false;
  renderReviews([]);
  assert.equal(nodes.reviews.hidden, true);
  renderReviews(undefined);
  assert.equal(nodes.reviews.hidden, true);
});

test('후기 글·이름·현장은 escape 해서 넣고 태그·속성으로 새지 않는다', () => {
  const { renderReviews, nodes } = load();
  renderReviews([{
    rating: 5,
    name: '<img src=x onerror="alert(1)">',
    space: '가상구 <b>가상</b>아파트 & "따옴표"',
    text: "”</p><script>alert('x')</script>",
  }]);
  const html = nodes.reviewsGrid.innerHTML;
  assert.equal(nodes.reviews.hidden, false);
  assert.doesNotMatch(html, /<img|<script|<b>가상|onerror="/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /가상구 &lt;b&gt;가상&lt;\/b&gt;아파트 &amp; &quot;따옴표&quot;/);
  assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.equal((html.match(/<article class="review reveal">/g) || []).length, 1);
});

test('별점은 1~5 정수일 때만 그리고, 문자열 별점은 속성으로 새지 않는다', () => {
  const { renderReviews, nodes } = load();
  renderReviews([
    { rating: 4, name: '가○○', space: '가상구', text: '가상 후기 본문입니다 열 자 넘게' },
    { rating: '5" onmouseover="alert(1)', name: '나○○', space: '가상구', text: '가상 후기 본문입니다 열 자 넘게' },
    { rating: 9, name: '다○', space: '가상구', text: '가상 후기 본문입니다 열 자 넘게' },
  ]);
  const html = nodes.reviewsGrid.innerHTML;
  assert.equal((html.match(/class="stars"/g) || []).length, 1);
  assert.match(html, /aria-label="별점 4점">★★★★☆</);
  assert.doesNotMatch(html, /onmouseover/);
  assert.equal((html.match(/<article/g) || []).length, 3);
});
