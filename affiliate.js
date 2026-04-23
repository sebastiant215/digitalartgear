function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAmazonHost(hostname) {
  return hostname === 'amazon.com' || hostname.endsWith('.amazon.com');
}

function isAllowedRedirectUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  return host === 'amzn.to' || isAmazonHost(host);
}

function formatAffiliateUrl(value, amazonTag) {
  const parsed = parseUrl(value);
  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase();
  if (isAmazonHost(host)) {
    if (!parsed.searchParams.has('tag') && amazonTag) {
      parsed.searchParams.set('tag', amazonTag);
    }
    return parsed.toString();
  }

  return value;
}

function buildCatalogCategories(products) {
  return [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

module.exports = {
  buildCatalogCategories,
  formatAffiliateUrl,
  isAllowedRedirectUrl,
};
