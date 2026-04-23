const test = require('node:test');
const assert = require('node:assert/strict');

const { getSearchConfigStatus } = require('../search-config');

test('getSearchConfigStatus reports enabled when Tavily and Anthropic keys are present', () => {
  assert.deepEqual(
    getSearchConfigStatus({ tavilyKey: 'tvly_123', anthropicKey: 'sk-ant-123' }),
    {
      enabled: true,
      missing: [],
      message: null,
    }
  );
});

test('getSearchConfigStatus reports missing providers with a Railway-friendly message', () => {
  assert.deepEqual(
    getSearchConfigStatus({ tavilyKey: '', anthropicKey: '' }),
    {
      enabled: false,
      missing: ['TAVILY_API_KEY', 'ANTHROPIC_API_KEY'],
      message:
        'AI Finder is not configured on this deployment yet. Add TAVILY_API_KEY and ANTHROPIC_API_KEY in Railway variables to enable live search.',
    }
  );
});
