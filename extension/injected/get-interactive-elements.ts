import { uniqueSelectorFn } from "./dom-utils";

export const getInteractiveElementsScript = () => `
(function() {
  ${uniqueSelectorFn}

  const selectors = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [onclick], [tabindex]';
  const directEls = document.querySelectorAll(selectors);
  const seen = new Set();
  const elements = [];

  // Also find elements that look clickable via cursor style
  const allEls = document.querySelectorAll('div, span, li, td, label, section, article, img, svg');
  const clickableEls = [];
  for (const el of allEls) {
    if (el.matches(selectors)) continue;
    const style = window.getComputedStyle(el);
    if (style.cursor === 'pointer' && !el.closest(selectors)) {
      clickableEls.push(el);
    }
  }
  const els = [...directEls, ...clickableEls];

  function getSemanticType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || el.getAttribute('role') === 'button' || el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return 'button';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'dropdown';
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'password') return 'password input';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      return 'text input';
    }
    return 'button';
  }

  function getNearestHeading(el) {
    let node = el;
    for (let i = 0; i < 10 && node; i++) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          return sibling.textContent.trim().substring(0, 50);
        }
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  }

  function getParentContext(el) {
    // Walk up to find the nearest container with meaningful text
    let node = el.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const text = node.textContent.trim();
      if (text.length > 0 && text.length < 200 && text !== el.textContent?.trim()) {
        // Collapse whitespace and truncate
        return text.replace(/\\s+/g, ' ').substring(0, 80);
      }
      node = node.parentElement;
    }
    return null;
  }

  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (el.offsetParent === null && el.tagName !== 'BODY') continue;

    const selector = uniqueSelector(el);
    if (seen.has(selector)) continue;
    seen.add(selector);

    const tag = el.tagName.toLowerCase();
    const semType = getSemanticType(el);
    const entry = {
      selector: selector,
      type: semType,
      enabled: !el.disabled,
    };

    const label = el.getAttribute('aria-label')
      || (el.labels && el.labels[0]?.textContent?.trim())
      || el.getAttribute('title')
      || (tag === 'a' || tag === 'button' ? el.textContent?.trim().substring(0, 50) : null);
    if (label) entry.label = label;

    if (tag === 'a' && el.href) entry.href = el.href;
    if (el.name) entry.name = el.name;

    if (semType === 'checkbox' || semType === 'radio') {
      entry.value = el.checked ? 'checked' : 'unchecked';
    } else if (semType === 'dropdown') {
      const opt = el.options && el.options[el.selectedIndex];
      if (opt) entry.value = opt.text;
      if (el.options) {
        const maxOpts = 50;
        const opts = [];
        for (let i = 0; i < Math.min(el.options.length, maxOpts); i++) {
          opts.push({ value: el.options[i].value, text: el.options[i].text });
        }
        entry.options = opts;
        if (el.options.length > maxOpts) entry.optionsTruncated = true;
      }
    } else if (semType !== 'password input' && el.value) {
      entry.value = el.value.substring(0, 100);
    }

    if (el.placeholder) entry.placeholder = el.placeholder;

    const heading = getNearestHeading(el);
    const parentCtx = getParentContext(el);
    if (heading && parentCtx && parentCtx !== heading) {
      entry.context = heading + ' > ' + parentCtx;
    } else if (parentCtx) {
      entry.context = parentCtx;
    } else if (heading) {
      entry.context = heading;
    }

    elements.push(entry);
  }
  return elements;
})();
`;
