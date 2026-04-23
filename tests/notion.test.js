const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeNotionProduct,
  filterProducts,
  createNotionClient,
} = require('../notion');

test('normalizeNotionProduct converts a Notion row into site product data', () => {
  const notionRow = {
    id: 'row-1',
    properties: {
      'Product Name': {
        title: [{ plain_text: 'Wacom Intuos Small' }],
      },
      'Amazon Link': {
        url: 'https://amzn.to/example',
      },
      Category: {
        select: { name: 'Drawing Tablets' },
      },
      Price: {
        number: 49.99,
      },
      Status: {
        status: { name: 'Active' },
      },
      'Product Image': {
        files: [
          {
            name: 'tablet.jpg',
            file: { url: 'https://images.example/tablet.jpg' },
          },
        ],
      },
    },
  };

  assert.deepEqual(normalizeNotionProduct(notionRow), {
    id: 'row-1',
    name: 'Wacom Intuos Small',
    slug: 'wacom-intuos-small',
    affiliateUrl: 'https://amzn.to/example',
    category: 'Drawing Tablets',
    price: 49.99,
    status: 'Active',
    imageUrl: 'https://images.example/tablet.jpg',
  });
});

test('filterProducts keeps only active products and optionally filters by category', () => {
  const products = [
    { name: 'A', status: 'Active', category: 'Drawing Tablets' },
    { name: 'B', status: 'Draft', category: 'Drawing Tablets' },
    { name: 'C', status: 'Active', category: 'Monitors' },
  ];

  assert.deepEqual(filterProducts(products, {}), [
    { name: 'A', status: 'Active', category: 'Drawing Tablets' },
    { name: 'C', status: 'Active', category: 'Monitors' },
  ]);

  assert.deepEqual(filterProducts(products, { category: 'monitors' }), [
    { name: 'C', status: 'Active', category: 'Monitors' },
  ]);
});

test('createNotionClient queries Notion and returns normalized products', async () => {
  let requestedUrl = null;
  let requestedBody = null;

  const client = createNotionClient({
    apiKey: 'test-key',
    dataSourceId: 'data-source-123',
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedBody = JSON.parse(options.body);

      return {
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'row-1',
              properties: {
                'Product Name': { title: [{ plain_text: 'HUION Kamvas 13' }] },
                'Amazon Link': { url: 'https://amzn.to/kamvas13' },
                Category: { select: { name: 'Drawing Tablets' } },
                Price: { number: 306.9 },
                Status: { status: { name: 'Active' } },
                'Product Image': { files: [] },
              },
            },
          ],
        }),
      };
    },
  });

  const products = await client.queryProducts({ category: 'Drawing Tablets' });

  assert.equal(
    requestedUrl,
    'https://api.notion.com/v1/data_sources/data-source-123/query'
  );
  assert.deepEqual(requestedBody.filter, {
    and: [
      { property: 'Status', status: { equals: 'Active' } },
      { property: 'Category', select: { equals: 'Drawing Tablets' } },
    ],
  });
  assert.equal(products.length, 1);
  assert.equal(products[0].slug, 'huion-kamvas-13');
});
