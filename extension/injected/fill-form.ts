export const fillFormScript = (
  fields: { selector: string; value?: string; checked?: boolean }[],
  submit?: string
) => `
(function() {
  const fields = ${JSON.stringify(fields)};
  const submitSelector = ${submit ? JSON.stringify(submit) : "null"};
  const results = [];
  for (const field of fields) {
    try {
      const el = document.querySelector(field.selector);
      if (!el) {
        results.push({ selector: field.selector, success: false, error: "Element not found" });
        continue;
      }
      el.focus();
      if (field.checked !== undefined) {
        el.checked = field.checked;
      } else if (field.value !== undefined) {
        el.value = field.value;
        if (el.tagName === 'SELECT' && el.value !== field.value) {
          const available = Array.from(el.options).map(o => o.value).slice(0, 20);
          results.push({ selector: field.selector, success: false, error: 'Value "' + field.value + '" is not a valid option. Available: ' + JSON.stringify(available) });
          continue;
        }
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      results.push({ selector: field.selector, success: true });
    } catch (e) {
      results.push({ selector: field.selector, success: false, error: e.message });
    }
  }
  let submitted = false;
  if (submitSelector) {
    const btn = document.querySelector(submitSelector);
    if (btn) {
      btn.click();
      submitted = true;
    }
  }
  return { results, submitted };
})();
`;
