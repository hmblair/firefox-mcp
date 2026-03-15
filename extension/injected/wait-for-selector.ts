export const waitForSelectorScript = (selector: string, timeoutMs: number) => `
new Promise((resolve) => {
  const selector = ${JSON.stringify(selector)};
  const timeout = ${timeoutMs};
  const existing = document.querySelector(selector);
  if (existing) {
    resolve({ found: true });
    return;
  }
  let resolved = false;
  const observer = new MutationObserver(() => {
    if (document.querySelector(selector)) {
      resolved = true;
      observer.disconnect();
      resolve({ found: true });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => {
    if (!resolved) {
      observer.disconnect();
      resolve({ found: false });
    }
  }, timeout);
});
`;
