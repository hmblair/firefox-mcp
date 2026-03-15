// Shared DOM utility functions for injected scripts.
// These are inlined as string fragments that other injected scripts concatenate.

export const isHiddenFn = `
function isHidden(el) {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return true;
  if (el.children.length === 0 && el.tagName !== 'BR' && el.tagName !== 'HR' && el.tagName !== 'IMG') {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 10 && rect.height > 0 && rect.height < 10) return true;
  }
  return false;
}`;

export const uniqueSelectorFn = `
function uniqueSelector(el) {
  if (el.id) return '#' + CSS.escape(el.id);

  let base = el.tagName.toLowerCase();
  if (el.name && el.tagName !== 'A') {
    base = el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
  } else {
    const type = el.getAttribute('type');
    if (type) base += '[type="' + type + '"]';
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\\s+/).slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
      base += cls;
    }
  }

  if (document.querySelectorAll(base).length === 1) return base;

  if (el.value && el.tagName === 'INPUT') {
    const withVal = base + '[value="' + CSS.escape(el.value) + '"]';
    if (document.querySelectorAll(withVal).length === 1) return withVal;
  }

  const parts = [];
  let node = el;
  for (let i = 0; i < 8; i++) {
    const parent = node.parentElement;
    if (!parent || parent === document.documentElement) break;
    const idx = Array.from(parent.children).indexOf(node) + 1;
    parts.unshift(':nth-child(' + idx + ')');
    if (parent.id) {
      parts.unshift('#' + CSS.escape(parent.id));
      const path = parts.join(' > ');
      if (document.querySelectorAll(path).length === 1) return path;
      break;
    }
    const path = parts.join(' > ');
    if (document.querySelectorAll(path).length === 1) return path;
    node = parent;
  }
  return parts.join(' > ');
}`;
