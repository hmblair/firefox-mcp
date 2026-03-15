export const pressKeyScript = (key: string, selector?: string) => `
(function() {
  const selector = ${selector ? JSON.stringify(selector) : "null"};
  const target = selector ? document.querySelector(selector) : (document.activeElement || document.body);
  if (!target) return { success: false, error: 'No element found matching "' + (selector || '') + '"' };
  const key = ${JSON.stringify(key)};
  const opts = { key: key, bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent('keydown', opts));
  target.dispatchEvent(new KeyboardEvent('keypress', opts));
  target.dispatchEvent(new KeyboardEvent('keyup', opts));
  if (key === 'Enter') {
    const form = target.closest ? target.closest('form') : null;
    if (form) form.requestSubmit();
  }
  return { success: true };
})();
`;
