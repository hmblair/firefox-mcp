export const searchTabContentScript = (query: string, contextChars: number) => `
(function() {
  const query = ${JSON.stringify(query)}.toLowerCase();
  const ctx = ${contextChars};
  const text = document.body.innerText;
  const lower = text.toLowerCase();
  const matches = [];
  let pos = 0;
  while (matches.length < 50) {
    const idx = lower.indexOf(query, pos);
    if (idx === -1) break;
    const start = Math.max(0, idx - ctx);
    const end = Math.min(text.length, idx + query.length + ctx);
    matches.push({ context: text.substring(start, end), index: idx });
    pos = idx + query.length;
  }
  return matches;
})();
`;
