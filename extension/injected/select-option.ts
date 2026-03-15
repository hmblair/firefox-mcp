export const selectOptionScript = (selector: string, value: string) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el || el.tagName !== 'SELECT') return { success: false, error: 'No <select> element found matching the selector' };
  const target = ${JSON.stringify(value)};
  el.value = target;
  if (el.value !== target) {
    const available = Array.from(el.options).map(o => o.value).slice(0, 20);
    return { success: false, error: 'Value "' + target + '" is not a valid option. Available values: ' + JSON.stringify(available) };
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return { success: true };
})();
`;
