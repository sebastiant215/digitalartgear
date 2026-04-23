const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { createNotionClient, filterProducts } = require('./notion');
const { buildCatalogCategories, formatAffiliateUrl, isAllowedRedirectUrl } = require('./affiliate');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TAVILY_KEY = process.env.TAVILY_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AMAZON_TAG = process.env.AMAZON_TAG || 'digitalartgear-20';
const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID || process.env.NOTION_DATABASE_ID || '';
const CLICKS_FILE = path.join(__dirname, 'clicks.json');

const notionClient =
  NOTION_API_KEY && NOTION_DATA_SOURCE_ID
    ? createNotionClient({ apiKey: NOTION_API_KEY, dataSourceId: NOTION_DATA_SOURCE_ID })
    : null;

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

function loadClicks() {
  try {
    return JSON.parse(fs.readFileSync(CLICKS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function logClick(slug, url) {
  const clicks = loadClicks();
  clicks.push({ slug, url, ts: new Date().toISOString() });
  fs.writeFileSync(CLICKS_FILE, JSON.stringify(clicks, null, 2));
}

const AFFILIATE_LINKS = {
  'wacom-ctl4100': { url: 'https://www.amazon.com/dp/B079HL9YSF', name: 'Wacom CTL4100 One by Wacom' },
  'wacom-intuos-m': { url: 'https://www.amazon.com/dp/B079HHD868', name: 'Wacom Intuos Medium' },
  'wacom-cintiq-16': { url: 'https://www.amazon.com/dp/B07V8YB5KQ', name: 'Wacom Cintiq 16' },
  'huion-h610pro': { url: 'https://www.amazon.com/dp/B07QQDL682', name: 'Huion H610 Pro V2' },
  'huion-kamvas-13': { url: 'https://www.amazon.com/dp/B08KGN7GHX', name: 'Huion Kamvas 13' },
  'xppen-deco01': { url: 'https://www.amazon.com/dp/B07PFQ9KPV', name: 'XP-Pen Deco 01 V2' },
  'xppen-artist-12': { url: 'https://www.amazon.com/dp/B08D5TVC7P', name: 'XP-Pen Artist 12 Pro' },
  'dell-u2722d': { url: 'https://www.amazon.com/dp/B092PQDQRM', name: 'Dell UltraSharp U2722D' },
  'lg-27uk850': { url: 'https://www.amazon.com/dp/B078GVTD9N', name: 'LG 27UK850-W 4K Monitor' },
  'asus-pa279cv': { url: 'https://www.amazon.com/dp/B09BKGCQHB', name: 'ASUS ProArt PA279CV' },
  'benq-sw270c': { url: 'https://www.amazon.com/dp/B07KXFQM7Z', name: 'BenQ SW270C PhotoVue' },
  'rtx-4070': { url: 'https://www.amazon.com/s?k=RTX+4070&tag=digitalartgear-20', name: 'NVIDIA RTX 4070' },
  'rtx-4060': { url: 'https://www.amazon.com/s?k=RTX+4060&tag=digitalartgear-20', name: 'NVIDIA RTX 4060' },
  'amd-rx-7800xt': { url: 'https://www.amazon.com/s?k=AMD+RX+7800+XT&tag=digitalartgear-20', name: 'AMD RX 7800 XT' },
  'evoluent-vm4r': { url: 'https://www.amazon.com/dp/B00WS9AAXY', name: 'Evoluent Vertical Mouse 4' },
  'xencelabs-quick-keys': { url: 'https://www.amazon.com/dp/B09P7GD6XQ', name: 'Xencelabs Quick Keys' },
  'ergotron-lx-arm': { url: 'https://www.amazon.com/dp/B0026HTBKU', name: 'Ergotron LX Monitor Arm' },
};

async function getCatalogProducts() {
  if (!notionClient) {
    const curatedProducts = Object.entries(AFFILIATE_LINKS).map(([slug, entry]) => ({
      id: slug,
      slug,
      name: entry.name,
      affiliateUrl: formatAffiliateUrl(entry.url, AMAZON_TAG),
      category: null,
      price: null,
      status: 'Active',
      imageUrl: null,
      source: 'curated',
    }));

    return filterProducts(curatedProducts, {});
  }

  const products = await notionClient.queryProducts();
  return filterProducts(
    products.map((product) => ({
      ...product,
      affiliateUrl: formatAffiliateUrl(product.affiliateUrl, AMAZON_TAG),
      source: 'notion',
    })),
    {}
  );
}

app.get('/redirect', (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).send('Missing url');

  let url;
  try {
    url = decodeURIComponent(raw);
  } catch {
    return res.status(400).send('Invalid url');
  }

  if (!isAllowedRedirectUrl(url)) return res.status(400).send('Invalid url');

  const formattedUrl = formatAffiliateUrl(url, AMAZON_TAG);
  logClick('redirect', formattedUrl);
  res.redirect(302, formattedUrl);
});

app.get('/go/:slug', (req, res) => {
  const { slug } = req.params;
  const entry = AFFILIATE_LINKS[slug];

  if (!entry) return res.status(404).send('Link not found');

  const url = formatAffiliateUrl(entry.url, AMAZON_TAG);
  logClick(slug, url);
  res.redirect(302, url);
});

app.get('/api/products', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const allProducts = await getCatalogProducts();
    const products = filterProducts(allProducts, { category: category || undefined });

    res.json({
      source: notionClient ? 'notion' : 'curated',
      category: category || null,
      count: products.length,
      categories: buildCatalogCategories(allProducts),
      products,
    });
  } catch (err) {
    console.error('[products error]', err.message);
    res.status(500).json({ error: 'Unable to load product catalog right now.' });
  }
});

app.get('/api/clicks', (req, res) => {
  const clicks = loadClicks();
  const stats = clicks.reduce((acc, click) => {
    acc[click.slug] = (acc[click.slug] || 0) + 1;
    return acc;
  }, {});

  res.json({
    total: clicks.length,
    bySlug: stats,
    recent: clicks.slice(-20).reverse(),
  });
});

app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query required' });
  }
  if (!TAVILY_KEY) {
    return res.status(500).json({ error: 'Missing TAVILY_API_KEY' });
  }
  if (!anthropic) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  }

  try {
    const tavilyRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: `best ${query} buy review price comparison 2025`,
        search_depth: 'advanced',
        max_results: 10,
        include_answer: true,
      }),
    });

    if (!tavilyRes.ok) throw new Error(`Tavily error: ${tavilyRes.status}`);

    const tavilyData = await tavilyRes.json();
    const results = tavilyData.results || [];
    const snippets = results
      .slice(0, 8)
      .map((r, i) => `[${i + 1}] ${r.title}\n${(r.content || '').slice(0, 400)}\nURL: ${r.url}`)
      .join('\n\n---\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a shopping assistant for digital artists. A user needs: "${query}"

Here are real search results from the web:
${snippets}

Based on these results, return a JSON array of 3-5 product recommendations ranked from most budget-friendly to best premium option.

Each product must have:
- name: specific product name/model
- tier: exactly one of "Budget" | "Mid-range" | "Premium"
- price_estimate: price string like "$49", "$150-200", or "from $299"
- why: 1-2 sentences explaining why this fits the user's need
- pros: array of exactly 3 short bullet points (start each with a verb)
- buy_url: a real URL from the search results above (pick the most relevant retailer or review page)

Rules:
- Use ONLY products actually mentioned in the search results
- Prioritize products relevant to digital artists (tablets, GPUs, monitors, courses, accessories)
- Return ONLY valid JSON, no markdown fences, no explanation

Format: {"products": [...]}`,
        },
      ],
    });

    const claudeOutput = message.content[0].text;
    const jsonMatch = claudeOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse AI response');

    const parsed = JSON.parse(jsonMatch[0]);

    res.json({
      products: parsed.products || [],
      answer: tavilyData.answer || null,
      query,
    });
  } catch (err) {
    console.error('[search error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3457;
app.listen(PORT, () => {
  console.log(`\n  Digital Art Gear running at http://localhost:${PORT}`);
  console.log(`  Pages: / | /finder.html | /about.html | /privacy.html`);
  console.log(`  Affiliate clicks: http://localhost:${PORT}/api/clicks\n`);
});
