export const clickAndTypeScript = (
  selector: string,
  text: string,
  clearFirst: boolean,
  submit: boolean
) => `
(async function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { success: false, error: 'No element found matching "${selector.replace(/"/g, '\\"')}"' };
  el.click();
  await new Promise(r => setTimeout(r, 50));
  const active = document.activeElement;
  if (!active || active === document.body) {
    return { success: false, error: 'No element received focus after clicking' };
  }
  const text = ${JSON.stringify(text)};
  if (${clearFirst}) {
    active.value = '';
  }
  active.value = ${clearFirst} ? text : (active.value || '') + text;
  active.dispatchEvent(new Event('input', { bubbles: true }));
  active.dispatchEvent(new Event('change', { bubbles: true }));
  if (${submit}) {
    const form = active.closest ? active.closest('form') : null;
    if (form) form.requestSubmit();
  }
  return { success: true };
})();
`;
