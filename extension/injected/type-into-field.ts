export const typeIntoFieldScript = (
  selector: string,
  text: string,
  clearFirst: boolean,
  submit: boolean
) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  el.focus();
  const text = ${JSON.stringify(text)};
  if (${clearFirst}) {
    el.value = '';
  }
  el.value = ${clearFirst} ? text : el.value + text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (${submit}) {
    const form = el.closest ? el.closest('form') : null;
    if (form) form.requestSubmit();
  }
  return true;
})();
`;
