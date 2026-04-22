const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TAVILY_KEY = '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';
const CLICKS_FILE = path.join(__dirname, 'clicks.json');

// Load or init click log
function loadClicks() {
  try { return JSON.parse(fs.readFileSync(CLICKS_FILE, 'utf8')); } catch { return []; }
}

function logClick(slug, url) {
  const clicks = loadClicks();
  clicks.push({ slug, url, ts: new Date().toISOString() });
  fs.writeFileSync(CLICKS_FILE, JSON.stringify(clicks, null, 2));
}

// Affiliate link registry — add real affiliate links here as you get approved
// Format: slug -> { url, tag } (tag = your affiliate tracking tag)
const AFFILIATE_LINKS = {
  // Example entries — replace URLs with your actual affiliate links
  'wacom-ctl4100': { url: 'https://www.amazon.com/dp/B079HL9YSF', tag: 'artrig-20' },
  'huion-h610pro':  { url: 'https://www.amazon.com/dp/B07QQDL682', tag: 'artrig-20' },
  'xppen-deco01':   { url: 'https://www.amazon.com/dp/B07QQDXXXX', tag: 'artrig-20' },
};

// /go/:slug — affiliate redirect with click tracking
app.get('/go/:slug', (req, res) => {
  const { slug } = req.params;
  const entry = AFFILIATE_LINKS[slug];

  if (!entry) {
    return res.status(404).send('Link not found');
  }

  // Append affiliate tag if it's an Amazon URL
  let url = entry.url;
  if (url.includes('amazon.com') && entry.tag) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}tag=${entry.tag}`;
  }

  logClick(slug, url);
  res.redirect(302, url);
});

// /api/clicks — view click stats (for your eyes only)
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
    const prompt = `You are a shopping assistant for digital artists. A user needs: "${query}"

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

Format: {"products": [...]}`;

    const claudeOutput = await new Promise((resolve, reject) => {
      execFile(
        'claude',
        ['--print', prompt],
        { timeout: 45000, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        }
      );
    });

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
  console.log(`\n  ArtRig running at http://localhost:${PORT}`);
  console.log(`  Pages: / | /finder.html | /about.html | /privacy.html`);
  console.log(`  Affiliate clicks: http://localhost:${PORT}/api/clicks\n`);
});
