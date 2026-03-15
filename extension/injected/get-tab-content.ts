import { isHiddenFn } from "./dom-utils";

export const getTabContentScript = (
  selector: string | null,
  includeLinks: boolean,
  offset: number,
  maxLength: number
) => `
(function() {
  const selector = ${selector ? JSON.stringify(selector) : "null"};
  const includeLinks = ${!!includeLinks};
  const offset = ${offset};
  const maxLen = ${maxLength};

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE']);
  const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'NAV',
    'HEADER', 'FOOTER', 'FORM', 'FIELDSET', 'TABLE', 'UL', 'OL', 'DL', 'BLOCKQUOTE',
    'PRE', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'ADDRESS']);
  const LANDMARK_TAGS = new Set(['MAIN', 'NAV', 'ASIDE', 'ARTICLE', 'HEADER', 'FOOTER', 'SECTION', 'FORM']);
  const LANDMARK_ROLES = { 'main': 'main', 'navigation': 'nav', 'complementary': 'aside',
    'banner': 'header', 'contentinfo': 'footer', 'form': 'form', 'region': 'section' };

  ${isHiddenFn}

  function nodeToText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/[ \\t]+/g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag)) return '';
    if (isHidden(el)) return '';

    const hMatch = tag.match(/^H([1-6])$/);
    if (hMatch) {
      const level = parseInt(hMatch[1]);
      const text = el.textContent.trim();
      if (!text) return '';
      return '\\n\\n' + '#'.repeat(level) + ' ' + text + '\\n\\n';
    }

    if (tag === 'HR') return '\\n\\n---\\n\\n';
    if (tag === 'BR') return '\\n';

    if (tag === 'IMG') {
      const alt = el.getAttribute('alt');
      return alt ? '[image: ' + alt + ']' : '';
    }

    if (tag === 'SELECT') {
      const opt = el.options && el.options[el.selectedIndex];
      if (!opt) return '[dropdown]';
      const text = opt.text.trim();
      const val = opt.value;
      return text !== val ? '[dropdown: ' + text + ' (' + val + ')]' : '[dropdown: ' + text + ']';
    }

    if (tag === 'LI') {
      const parent = el.parentElement;
      const isOrdered = parent && parent.tagName === 'OL';
      const prefix = isOrdered
        ? (Array.from(parent.children).indexOf(el) + 1) + '. '
        : '- ';
      const inner = childrenToText(el);
      return '\\n' + prefix + inner.trim();
    }

    if (tag === 'UL' || tag === 'OL') {
      return '\\n' + childrenToText(el) + '\\n';
    }

    if (tag === 'BLOCKQUOTE') {
      const inner = childrenToText(el).trim();
      const lines = inner.split('\\n').map(l => '> ' + l).join('\\n');
      return '\\n\\n' + lines + '\\n\\n';
    }

    if (tag === 'PRE') {
      return '\\n\\n\`\`\`\\n' + el.textContent + '\\n\`\`\`\\n\\n';
    }

    if (tag === 'TABLE') {
      return '\\n\\n' + tableToText(el) + '\\n\\n';
    }

    if (tag === 'STRONG' || tag === 'B') {
      const t = childrenToText(el).trim();
      return t ? '**' + t + '**' : '';
    }
    if (tag === 'EM' || tag === 'I') {
      const t = childrenToText(el).trim();
      return t ? '*' + t + '*' : '';
    }

    if (tag === 'A') {
      const t = childrenToText(el).trim();
      return t || '';
    }

    const inner = childrenToText(el);
    if (BLOCK_TAGS.has(tag)) {
      return '\\n\\n' + inner + '\\n\\n';
    }

    return inner;
  }

  function childrenToText(el) {
    let result = '';
    for (const child of el.childNodes) {
      result += nodeToText(child);
    }
    return result;
  }

  function tableToText(table) {
    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) return '';
    const result = [];
    let isFirst = true;
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td');
      const cellTexts = Array.from(cells).map(c => c.textContent.trim().replace(/\\|/g, '/'));
      result.push('| ' + cellTexts.join(' | ') + ' |');
      if (isFirst) {
        result.push('| ' + cellTexts.map(() => '---').join(' | ') + ' |');
        isFirst = false;
      }
    }
    return result.join('\\n');
  }

  function cleanText(text) {
    text = text.split('\\n').map(l => l.trim()).join('\\n');
    text = text.replace(/\\n{3,}/g, '\\n\\n');
    return text.trim();
  }

  function getSectionLabel(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    let label = LANDMARK_ROLES[role] || (LANDMARK_TAGS.has(el.tagName) ? tag : 'content');

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      label += ': ' + ariaLabel.substring(0, 50);
    } else {
      const heading = el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > * > h1, :scope > * > h2, :scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6');
      if (heading) {
        const hText = heading.textContent.trim().substring(0, 50);
        if (hText) label += ': ' + hText;
      } else {
        const ph = el.querySelector('input[placeholder], textarea[placeholder]');
        if (ph) {
          label += ': ' + ph.getAttribute('placeholder').substring(0, 50);
        }
      }
    }
    return label;
  }

  function getFormLabel(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return 'form: ' + ariaLabel.substring(0, 50);
    const heading = el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > * > h1, :scope > * > h2, :scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6');
    if (heading) {
      const hText = heading.textContent.trim().substring(0, 50);
      if (hText) return 'form: ' + hText;
    }
    const ph = el.querySelector('input[placeholder], textarea[placeholder]');
    if (ph) return 'form: ' + ph.getAttribute('placeholder').substring(0, 50);
    return 'form';
  }

  function getLinks(root) {
    if (!includeLinks) return [];
    const linkElements = root.querySelectorAll('a[href]');
    return Array.from(linkElements).map(el => ({
      url: el.href,
      text: el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
    })).filter(link => link.text !== '' && link.url.startsWith('http') && !link.url.includes('#'));
  }

  if (selector) {
    const root = document.querySelector(selector);
    if (!root) return { selectorNotFound: true, fullText: '', sections: null, isTruncated: false, totalLength: 0, links: [] };
    const raw = cleanText(nodeToText(root));
    const totalLength = raw.length;
    let text = raw.substring(offset);
    let isTruncated = false;
    if (text.length > maxLen) {
      text = text.substring(0, maxLen);
      isTruncated = true;
    }
    return { fullText: text, sections: null, isTruncated, totalLength, selectorNotFound: false, links: getLinks(root) };
  }

  const LANDMARK_SECTION_TAGS = new Set(['NAV', 'ASIDE', 'HEADER', 'FOOTER', 'ARTICLE']);
  const LANDMARK_ROLE_MAP = { 'navigation': true, 'complementary': true, 'banner': true, 'contentinfo': true };

  function getLandmarkType(el) {
    if (LANDMARK_SECTION_TAGS.has(el.tagName)) return 'landmark';
    if (el.tagName === 'FORM') return 'form';
    const role = el.getAttribute && el.getAttribute('role');
    if (!role) return null;
    if (LANDMARK_ROLE_MAP[role]) return 'landmark';
    if (role === 'form') return 'form';
    return null;
  }

  const sections = [];
  let budget = maxLen;
  let totalLength = 0;
  let isTruncated = false;
  let currentSection = null;
  let inForm = false;

  function flushText(text) {
    if (!text) return;
    totalLength += text.length;
    if (text.length > budget) {
      text = text.substring(0, budget);
      isTruncated = true;
    }
    budget -= text.length;
    if (!currentSection) {
      currentSection = { label: 'content', content: text, fromHeading: false };
    } else {
      currentSection.content += text;
    }
  }

  function startSection(label, fromHeading) {
    if (currentSection && currentSection.content.trim()) {
      currentSection.content = cleanText(currentSection.content);
      sections.push(currentSection);
    }
    if (label !== null) {
      currentSection = { label, content: '', fromHeading };
    } else {
      currentSection = null;
    }
  }

  function walkNode(node) {
    if (budget <= 0) { isTruncated = true; return; }

    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.replace(/[ \\t]+/g, ' ');
      flushText(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag)) return;
    if (isHidden(el)) return;

    const hMatch = tag.match(/^H([1-6])$/);
    if (hMatch) {
      const text = el.textContent.trim();
      if (text) {
        const level = parseInt(hMatch[1]);
        if (!inForm) {
          startSection('section: ' + text.replace(/\\s+/g, ' ').substring(0, 50), true);
        }
        flushText('#'.repeat(level) + ' ' + text + '\\n\\n');
      }
      return;
    }

    const landmarkType = getLandmarkType(el);

    if (landmarkType === 'landmark') {
      startSection(getSectionLabel(el), false);
      for (const child of el.childNodes) {
        walkNode(child);
        if (budget <= 0) break;
      }
      startSection(null, false);
      return;
    }

    if (landmarkType === 'form') {
      if (currentSection && currentSection.fromHeading) {
        inForm = true;
        for (const child of el.childNodes) {
          walkNode(child);
          if (budget <= 0) break;
        }
        inForm = false;
      } else {
        startSection(getFormLabel(el), false);
        inForm = true;
        for (const child of el.childNodes) {
          walkNode(child);
          if (budget <= 0) break;
        }
        inForm = false;
      }
      return;
    }

    if (tag === 'HR') { flushText('\\n\\n---\\n\\n'); return; }
    if (tag === 'BR') { flushText('\\n'); return; }
    if (tag === 'IMG') {
      const alt = el.getAttribute('alt');
      if (alt) flushText('[image: ' + alt + ']');
      return;
    }
    if (tag === 'SELECT') {
      const opt = el.options && el.options[el.selectedIndex];
      if (!opt) { flushText('[dropdown]'); return; }
      const text = opt.text.trim();
      const val = opt.value;
      flushText(text !== val ? '[dropdown: ' + text + ' (' + val + ')]' : '[dropdown: ' + text + ']');
      return;
    }
    if (tag === 'LI') {
      const parent = el.parentElement;
      const isOrdered = parent && parent.tagName === 'OL';
      const prefix = isOrdered
        ? (Array.from(parent.children).indexOf(el) + 1) + '. '
        : '- ';
      flushText('\\n' + prefix);
      for (const child of el.childNodes) {
        walkNode(child);
        if (budget <= 0) break;
      }
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      flushText('\\n');
      for (const child of el.childNodes) {
        walkNode(child);
        if (budget <= 0) break;
      }
      flushText('\\n');
      return;
    }
    if (tag === 'BLOCKQUOTE') {
      const inner = childrenToText(el).trim();
      const lines = inner.split('\\n').map(l => '> ' + l).join('\\n');
      flushText('\\n\\n' + lines + '\\n\\n');
      return;
    }
    if (tag === 'PRE') {
      flushText('\\n\\n\`\`\`\\n' + el.textContent + '\\n\`\`\`\\n\\n');
      return;
    }
    if (tag === 'TABLE') {
      flushText('\\n\\n' + tableToText(el) + '\\n\\n');
      return;
    }
    if (tag === 'STRONG' || tag === 'B') {
      const t = childrenToText(el).trim();
      if (t) flushText('**' + t + '**');
      return;
    }
    if (tag === 'EM' || tag === 'I') {
      const t = childrenToText(el).trim();
      if (t) flushText('*' + t + '*');
      return;
    }
    if (tag === 'A') {
      const t = childrenToText(el).trim();
      if (t) flushText(t);
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) flushText('\\n\\n');
    for (const child of el.childNodes) {
      walkNode(child);
      if (budget <= 0) break;
    }
    if (isBlock) flushText('\\n\\n');
  }

  for (const child of document.body.childNodes) {
    walkNode(child);
    if (budget <= 0) break;
  }

  if (currentSection && currentSection.content.trim()) {
    currentSection.content = cleanText(currentSection.content);
    sections.push(currentSection);
  }

  if (sections.length <= 1) {
    const raw = sections.length === 1 ? sections[0].content : '';
    let text = raw.substring(offset);
    if (text.length > maxLen) {
      text = text.substring(0, maxLen);
      isTruncated = true;
    }
    return { fullText: text, sections: null, isTruncated, totalLength, selectorNotFound: false, links: getLinks(document.body) };
  }

  if (offset > 0) {
    let skip = offset;
    const trimmed = [];
    for (const s of sections) {
      if (skip >= s.content.length) {
        skip -= s.content.length;
        continue;
      }
      if (skip > 0) {
        trimmed.push({ label: s.label, content: s.content.substring(skip) });
        skip = 0;
      } else {
        trimmed.push(s);
      }
    }
    return { fullText: null, sections: trimmed, isTruncated, totalLength, selectorNotFound: false, links: includeLinks ? getLinks(document.body) : [] };
  }

  const cleanSections = sections.map(s => ({ label: s.label, content: s.content }));
  return { fullText: null, sections: cleanSections, isTruncated, totalLength, selectorNotFound: false, links: includeLinks ? getLinks(document.body) : [] };
})();
`;
