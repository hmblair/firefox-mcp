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
      return opt ? '[dropdown: ' + opt.text.trim() + ']' : '[dropdown]';
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

    const heading = el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > * > h1, :scope > * > h2, :scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6');
    if (heading) {
      const hText = heading.textContent.trim().substring(0, 50);
      if (hText) label += ': ' + hText;
    } else {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) {
        label += ': ' + ariaLabel.substring(0, 50);
      }
    }
    return label;
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

  const landmarkSelector = 'main, nav, aside, article, header, footer, section, form, [role="main"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"], [role="form"], [role="region"]';
  const landmarks = document.querySelectorAll(landmarkSelector);

  const topLandmarks = Array.from(landmarks).filter(el => {
    let parent = el.parentElement;
    while (parent) {
      if (parent.matches && parent.matches(landmarkSelector)) return false;
      parent = parent.parentElement;
    }
    return true;
  });

  if (topLandmarks.length === 0) {
    const root = document.body;
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

  const landmarkSet = new Set(topLandmarks);
  const sections = [];
  let budget = maxLen;
  let totalLength = 0;
  let isTruncated = false;

  function processNode(node) {
    if (budget <= 0) { isTruncated = true; return; }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) {
        if (sections.length > 0 && sections[sections.length - 1].label === 'content') {
          sections[sections.length - 1].content += '\\n' + t;
        } else {
          sections.push({ label: 'content', content: t });
        }
        totalLength += t.length;
        budget -= t.length;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (SKIP_TAGS.has(node.tagName)) return;
    if (isHidden(node)) return;

    if (landmarkSet.has(node)) {
      const raw = cleanText(childrenToText(node));
      totalLength += raw.length;
      let content = raw;
      if (content.length > budget) {
        content = content.substring(0, budget);
        isTruncated = true;
      }
      budget -= content.length;
      if (content) sections.push({ label: getSectionLabel(node), content });
      return;
    }

    const hasLandmarkChild = node.querySelector && node.querySelector(landmarkSelector);
    if (hasLandmarkChild) {
      for (const child of node.childNodes) {
        processNode(child);
        if (budget <= 0) break;
      }
    } else {
      const raw = cleanText(nodeToText(node));
      if (raw) {
        totalLength += raw.length;
        let content = raw;
        if (content.length > budget) {
          content = content.substring(0, budget);
          isTruncated = true;
        }
        budget -= content.length;
        if (sections.length > 0 && sections[sections.length - 1].label === 'content') {
          sections[sections.length - 1].content += '\\n\\n' + content;
        } else {
          sections.push({ label: 'content', content });
        }
      }
    }
  }

  for (const child of document.body.childNodes) {
    processNode(child);
    if (budget <= 0) break;
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

  return { fullText: null, sections, isTruncated, totalLength, selectorNotFound: false, links: includeLinks ? getLinks(document.body) : [] };
})();
`;
