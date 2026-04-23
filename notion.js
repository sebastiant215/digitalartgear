function getPlainTextTitle(property) {
  const title = property?.title || [];
  return title.map((part) => part.plain_text || part.text?.content || '').join('').trim();
}

function getFileUrl(fileProperty) {
  const first = fileProperty?.files?.[0];
  if (!first) return null;
  return first.file?.url || first.external?.url || null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeNotionProduct(row) {
  const properties = row?.properties || {};
  const name = getPlainTextTitle(properties['Product Name']);

  return {
    id: row.id,
    name,
    slug: slugify(name),
    affiliateUrl: properties['Amazon Link']?.url || null,
    category: properties.Category?.select?.name || null,
    price: properties.Price?.number ?? null,
    status: properties.Status?.status?.name || 'Draft',
    imageUrl: getFileUrl(properties['Product Image']),
  };
}

function filterProducts(products, { category } = {}) {
  let filtered = products.filter((product) => product.status === 'Active');

  if (category) {
    const normalizedCategory = String(category).trim().toLowerCase();
    filtered = filtered.filter(
      (product) => String(product.category || '').trim().toLowerCase() === normalizedCategory
    );
  }

  return filtered;
}

function buildFilter({ category } = {}) {
  const and = [{ property: 'Status', status: { equals: 'Active' } }];

  if (category) {
    and.push({ property: 'Category', select: { equals: category } });
  }

  return { and };
}

function createNotionClient({ apiKey, dataSourceId, fetchImpl = global.fetch }) {
  if (!apiKey) throw new Error('Missing NOTION_API_KEY');
  if (!dataSourceId) throw new Error('Missing NOTION_DATA_SOURCE_ID');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');

  return {
    async queryProducts({ category } = {}) {
      const response = await fetchImpl(
        `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Notion-Version': '2025-09-03',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filter: buildFilter({ category }),
            sorts: [{ property: 'Price', direction: 'ascending' }],
          }),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || `Notion API error: ${response.status}`);
      }

      return (payload.results || []).map(normalizeNotionProduct);
    },
  };
}

module.exports = {
  normalizeNotionProduct,
  filterProducts,
  createNotionClient,
  slugify,
};
