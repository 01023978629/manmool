import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('js/design-bom.js', 'utf8'), context);

const site = JSON.parse(fs.readFileSync('data/site.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('data/material-catalog.json', 'utf8'));
const expectedSpaces = ['거실', '침실', '주방', '욕실', '현관', '서재', '아이방', '드레스룸'];
const rows = site.portfolio.map((item) => ({
  item,
  bom: context.window.DesignBom.build(item, catalog)
}));

assert.equal(rows.length, 240, '디자인 시안은 총 240개여야 합니다.');

for (const row of rows) {
  const { item, bom } = row;
  assert.ok(bom.lines.length >= 4, `${item.id}: BOM 항목이 부족합니다.`);
  assert.ok(bom.rangeLow < bom.total, `${item.id}: 하한이 기준금액보다 작아야 합니다.`);
  assert.ok(bom.rangeHigh > bom.total, `${item.id}: 상한이 기준금액보다 커야 합니다.`);
  assert.ok(bom.metrics.roomPyeong > 0, `${item.id}: 공간 평수가 필요합니다.`);
  assert.match(
    context.window.DesignBom.formatCompactRange(bom.rangeLow, bom.rangeHigh),
    /^\d[\d,]*~\d[\d,]*만원$/,
    `${item.id}: 카드용 예상비용 형식이 올바르지 않습니다.`
  );
}

const summary = expectedSpaces.map((space) => {
  const list = rows.filter((row) => row.item.spaceType === space);
  assert.equal(list.length, 30, `${space}: 디자인이 30개여야 합니다.`);

  const representative = list
    .filter((row) =>
      row.item.budget === '3천~5천만원' &&
      row.item.area >= 20 &&
      row.item.area < 40)
    .sort((a, b) => a.bom.total - b.bom.total);
  const representativeRow = representative[Math.floor(representative.length / 2)];

  assert.ok(representativeRow, `${space}: 표준형 대표 견적이 필요합니다.`);
  return {
    공간: space,
    기준주택: `${representativeRow.item.area}평형`,
    공간면적: `${representativeRow.bom.metrics.roomPyeong}평`,
    대표예상비용: context.window.DesignBom.formatCompactRange(
      representativeRow.bom.rangeLow,
      representativeRow.bom.rangeHigh
    )
  };
});

const bathroom = summary.find((row) => row.공간 === '욕실');
const bathroomLow = Number(bathroom.대표예상비용.split('~')[0].replaceAll(',', ''));
const bathroomHigh = Number(bathroom.대표예상비용.split('~')[1].replace(/[^\d]/g, ''));
assert.ok(bathroomLow >= 500 && bathroomLow <= 800, '표준형 욕실 하한은 500~800만원 범위여야 합니다.');
assert.ok(bathroomHigh >= 700 && bathroomHigh <= 1000, '표준형 욕실 상한은 700~1,000만원 범위여야 합니다.');

console.table(summary);
console.log('공간별 예상비용 검증 완료: 8개 공간 · 240개 시안');
