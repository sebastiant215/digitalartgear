const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatAffiliateUrl,
  isAllowedRedirectUrl,
  buildCatalogCategories,
} = require('../affiliate');

test('formatAffiliateUrl appends tag to supported amazon detail URLs', () => {
  const out = formatAffiliateUrl('https://www.amazon.com/dp/B079HHD868', 'digitalartgear-20');
  assert.equal(out, 'https://www.amazon.com/dp/B079HHD868?tag=digitalartgear-20');
});

test('formatAffiliateUrl preserves existing affiliate tags and shortened amazon links', () => {
  assert.equal(
    formatAffiliateUrl('https://www.amazon.com/dp/B079HHD868?tag=existing-20', 'digitalartgear-20'),
    'https://www.amazon.com/dp/B079HHD868?tag=existing-20'
  );
  assert.equal(
    formatAffiliateUrl('https://amzn.to/example', 'digitalartgear-20'),
    'https://amzn.to/example'
  );
});

test('isAllowedRedirectUrl accepts secure amazon links but rejects other or insecure hosts', () => {
  assert.equal(isAllowedRedirectUrl('https://www.amazon.com/dp/B079HHD868'), true);
  assert.equal(isAllowedRedirectUrl('https://amzn.to/example'), true);
  assert.equal(isAllowedRedirectUrl('http://www.amazon.com/dp/B079HHD868'), false);
  assert.equal(isAllowedRedirectUrl('http://amzn.to/example'), false);
  assert.equal(isAllowedRedirectUrl('https://evil-amazon.com/phish?amazon.com=true'), false);
  assert.equal(isAllowedRedirectUrl('https://example.com/product'), false);
});

test('buildCatalogCategories returns sorted distinct categories', () => {
  const categories = buildCatalogCategories([
    { category: 'Monitors' },
    { category: 'Drawing Tablets' },
    { category: 'Monitors' },
    { category: null },
  ]);

  assert.deepEqual(categories, ['Drawing Tablets', 'Monitors']);
});
