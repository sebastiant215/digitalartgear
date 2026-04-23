function getSearchConfigStatus({ tavilyKey, anthropicKey }) {
  const missing = [];
  if (!tavilyKey) missing.push('TAVILY_API_KEY');
  if (!anthropicKey) missing.push('ANTHROPIC_API_KEY');

  if (!missing.length) {
    return {
      enabled: true,
      missing: [],
      message: null,
    };
  }

  return {
    enabled: false,
    missing,
    message: `AI Finder is not configured on this deployment yet. Add ${missing.join(
      ' and '
    )} in Railway variables to enable live search.`,
  };
}

module.exports = {
  getSearchConfigStatus,
};
