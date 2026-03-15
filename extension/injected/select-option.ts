export const selectOptionScript = (selector: string, value: string, values?: string[]) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el || el.tagName !== 'SELECT') return { success: false, error: 'No <select> element found matching the selector' };
  const values = ${JSON.stringify(values ?? null)};
  if (values) {
    if (!el.multiple) return { success: false, error: 'Element is not a multi-select. Use "value" instead of "values".' };
    const available = new Set(Array.from(el.options).map(o => o.value));
    const invalid = values.filter(v => !available.has(v));
    if (invalid.length > 0) {
      return { success: false, error: 'Invalid values: ' + JSON.stringify(invalid) + '. Available: ' + JSON.stringify(Array.from(available).slice(0, 20)) };
    }
    const valueSet = new Set(values);
    for (const opt of el.options) {
      opt.selected = valueSet.has(opt.value);
    }
  } else {
    const target = ${JSON.stringify(value)};
    el.value = target;
    if (el.value !== target) {
      const available = Array.from(el.options).map(o => o.value).slice(0, 20);
      return { success: false, error: 'Value "' + target + '" is not a valid option. Available values: ' + JSON.stringify(available) };
    }
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return { success: true };
})();
`;
