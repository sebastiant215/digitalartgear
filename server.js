const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TAVILY_KEY = process.env.TAVILY_API_KEY || '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';
const AMAZON_TAG = process.env.AMAZON_TAG || 'digitalartgear-20';
const CLICKS_FILE = path.join(__dirname, 'clicks.json');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Load or init click log
function loadClicks() {
  try { return JSON.parse(fs.readFileSync(CLICKS_FILE, 'utf8')); } catch { return []; }
}

function logClick(slug, url) {
  const clicks = loadClicks();
  clicks.push({ slug, url, ts: new Date().toISOString() });
  fs.writeFileSync(CLICKS_FILE, JSON.stringify(clicks, null, 2));
}

// Affiliate link registry — curated products with verified affiliate links
const AFFILIATE_LINKS = {
  // Drawing Tablets
  'wacom-ctl4100':       { url: 'https://www.amazon.com/dp/B079HL9YSF', name: 'Wacom CTL4100 One by Wacom' },
  'wacom-intuos-m':      { url: 'https://www.amazon.com/dp/B079HHD868', name: 'Wacom Intuos Medium' },
  'wacom-cintiq-16':     { url: 'https://www.amazon.com/dp/B07V8YB5KQ', name: 'Wacom Cintiq 16' },
  'huion-h610pro':       { url: 'https://www.amazon.com/dp/B07QQDL682', name: 'Huion H610 Pro V2' },
  'huion-kamvas-13':     { url: 'https://www.amazon.com/dp/B08KGN7GHX', name: 'Huion Kamvas 13' },
  'xppen-deco01':        { url: 'https://www.amazon.com/dp/B07PFQ9KPV', name: 'XP-Pen Deco 01 V2' },
  'xppen-artist-12':     { url: 'https://www.amazon.com/dp/B08D5TVC7P', name: 'XP-Pen Artist 12 Pro' },
  // Monitors
  'dell-u2722d':         { url: 'https://www.amazon.com/dp/B092PQDQRM', name: 'Dell UltraSharp U2722D' },
  'lg-27uk850':          { url: 'https://www.amazon.com/dp/B078GVTD9N', name: 'LG 27UK850-W 4K Monitor' },
  'asus-pa279cv':        { url: 'https://www.amazon.com/dp/B09BKGCQHB', name: 'ASUS ProArt PA279CV' },
  'benq-sw270c':         { url: 'https://www.amazon.com/dp/B07KXFQM7Z', name: 'BenQ SW270C PhotoVue' },
  // GPUs
  'rtx-4070':            { url: 'https://www.amazon.com/s?k=RTX+4070&tag=digitalartgear-20', name: 'NVIDIA RTX 4070' },
  'rtx-4060':            { url: 'https://www.amazon.com/s?k=RTX+4060&tag=digitalartgear-20', name: 'NVIDIA RTX 4060' },
  'amd-rx-7800xt':       { url: 'https://www.amazon.com/s?k=AMD+RX+7800+XT&tag=digitalartgear-20', name: 'AMD RX 7800 XT' },
  // Accessories
  'evoluent-vm4r':       { url: 'https://www.amazon.com/dp/B00WS9AAXY', name: 'Evoluent Vertical Mouse 4' },
  'xencelabs-quick-keys': { url: 'https://www.amazon.com/dp/B09P7GD6XQ', name: 'Xencelabs Quick Keys' },
  'ergotron-lx-arm':     { url: 'https://www.amazon.com/dp/B0026HTBKU', name: 'Ergotron LX Monitor Arm' },
};

// /redirect?url=<encoded> — tracks AI-generated buy links and injects affiliate tag
app.get('/redirect', (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).send('Missing url');

  let url;
  try { url = decodeURIComponent(raw); } catch { return res.status(400).send('Invalid url'); }

  if (!/^https?:\/\//i.test(url)) return res.status(400).send('Invalid url');

  if (url.includes('amazon.com') && !url.includes('tag=')) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}tag=${AMAZON_TAG}`;
  }

  logClick('redirect', url);
  res.redirect(302, url);
});

// /go/:slug — affiliate redirect with click tracking
app.get('/go/:slug', (req, res) => {
  const { slug } = req.params;
  const entry = AFFILIATE_LINKS[slug];

  if (!entry) return res.status(404).send('Link not found');

  let url = entry.url;
  if (url.includes('amazon.com') && !url.includes('tag=')) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}tag=${AMAZON_TAG}`;
  }

  logClick(slug, url);
  res.redirect(302, url);
});

// /api/clicks — view click stats
app.get('/api/clicks', (req, res) => {
  const clicks = loadClicks();
  const stats = clicks.reduce((acc, c) => {
    acc[c.slug] = (acc[c.slug] || 0) + 1;
    return acc;
  }, {});
  res.json({ total: clicks.length, bySlug: stats, recent: clicks.slice(-20).reverse() });
});

// /api/search — AI-powered product finder
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query required' });
  }

  try {
    // 1. Search Tavily for real product data
    const tavilyRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: `best ${query} buy review price comparison 2025`,
        search_depth: 'advanced',
        max_results: 10,
        include_answer: true
      })
    });

    if (!tavilyRes.ok) throw new Error(`Tavily error: ${tavilyRes.status}`);

    const tavilyData = await tavilyRes.json();
    const results = tavilyData.results || [];

    const snippets = results
      .slice(0, 8)
      .map((r, i) => `[${i + 1}] ${r.title}\n${(r.content || '').slice(0, 400)}\nURL: ${r.url}`)
      .join('\n\n---\n\n');

    // 2. Ask Claude to analyze and rank products
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
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

Format: {"products": [...]}`
      }]
    });

    const claudeOutput = message.content[0].text;
    const jsonMatch = claudeOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse AI response');

    const parsed = JSON.parse(jsonMatch[0]);

    res.json({
      products: parsed.products || [],
      answer: tavilyData.answer || null,
      query
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
