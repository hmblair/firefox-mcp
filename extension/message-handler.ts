import type { ServerMessageRequest } from "../common";
import { WebsocketClient } from "./client";

function waitForTabLoad(tabId: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve(); // resolve even on timeout — best effort
    }, timeoutMs);

    function listener(
      updatedTabId: number,
      changeInfo: browser.tabs._OnUpdatedChangeInfo
    ) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    browser.tabs.onUpdated.addListener(listener);
  });
}

async function waitForPossibleNavigation(tabId: number): Promise<void> {
  await new Promise((r) => setTimeout(r, 100));
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === "loading") {
      await waitForTabLoad(tabId);
    }
  } catch {
    // tab may have been replaced
  }
}

export class MessageHandler {
  private client: WebsocketClient;

  constructor(client: WebsocketClient) {
    this.client = client;
  }

  public async handleDecodedMessage(req: ServerMessageRequest): Promise<void> {
    console.log(`[handler] ${req.cmd} (id: ${req.correlationId})`, JSON.stringify(req, null, 2));
    try {
      await this.dispatchCommand(req);
    } catch (error) {
      console.error(`[handler] ${req.cmd} (id: ${req.correlationId}) failed:`, error);
      await this.client.sendErrorToServer(
        req.correlationId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async dispatchCommand(req: ServerMessageRequest): Promise<void> {
    switch (req.cmd) {
      case "open-link":
        await this.openLink(
          req.correlationId,
          req.url,
          req.tabId,
          req.newTab
        );
        break;
      case "close-tabs":
        await this.closeTabs(req.correlationId, req.tabIds);
        break;
      case "get-tab-list":
        await this.sendTabs(req.correlationId);
        break;
      case "get-tab-content":
        await this.sendTabsContent(
          req.correlationId,
          req.tabId,
          req.offset,
          req.selector,
          req.includeLinks,
          req.maxLength
        );
        break;
      case "search-tab-content":
        await this.searchTabContent(
          req.correlationId,
          req.tabId,
          req.query,
          req.contextChars
        );
        break;
      case "get-interactive-elements":
        await this.getInteractiveElements(req.correlationId, req.tabId);
        break;
      case "click-element":
        await this.clickElement(req.correlationId, req.tabId, req.selector);
        break;
      case "type-into-field":
        await this.typeIntoField(
          req.correlationId,
          req.tabId,
          req.selector,
          req.text,
          req.clearFirst ?? true,
          req.submit ?? false
        );
        break;
      case "press-key":
        await this.pressKey(
          req.correlationId,
          req.tabId,
          req.key,
          req.selector
        );
        break;
      case "select-option":
        await this.selectOption(
          req.correlationId,
          req.tabId,
          req.selector,
          req.value
        );
        break;
      case "get-tab-info":
        await this.getTabInfo(req.correlationId, req.tabId);
        break;
      case "fill-form":
        await this.fillForm(
          req.correlationId,
          req.tabId,
          req.fields,
          req.submit
        );
        break;
      case "wait-for-selector":
        await this.waitForSelector(
          req.correlationId,
          req.tabId,
          req.selector,
          req.timeoutMs
        );
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("Invalid message received:", req);
    }
  }

  private async openLink(
    correlationId: string,
    url: string,
    tabId?: number,
    newTab?: boolean
  ): Promise<void> {
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      console.error("Invalid URL:", url);
      throw new Error("Invalid URL: must use http:// or https://");
    }

    let resultTabId: number | undefined;

    if (newTab) {
      const tab = await browser.tabs.create({ url });
      resultTabId = tab.id;
    } else {
      let targetTabId = tabId;
      if (targetTabId === undefined) {
        const activeTabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        targetTabId = activeTabs[0]?.id;
      }
      if (targetTabId === undefined) {
        const tab = await browser.tabs.create({ url });
        resultTabId = tab.id;
      } else {
        await browser.tabs.update(targetTabId, { url, active: true });
        resultTabId = targetTabId;
      }
    }

    if (resultTabId !== undefined) {
      await waitForTabLoad(resultTabId);
    }

    await this.client.sendResourceToServer({
      resource: "opened-tab-id",
      correlationId,
      tabId: resultTabId,
    });
  }

  private async closeTabs(
    correlationId: string,
    tabIds: number[]
  ): Promise<void> {
    const closedTabIds: number[] = [];
    const failedTabIds: number[] = [];
    for (const id of tabIds) {
      try {
        await browser.tabs.remove(id);
        closedTabIds.push(id);
      } catch {
        failedTabIds.push(id);
      }
    }
    await this.client.sendResourceToServer({
      resource: "tabs-closed",
      correlationId,
      closedTabIds,
      failedTabIds,
    });
  }

  private async sendTabs(correlationId: string): Promise<void> {
    const tabs = await browser.tabs.query({});
    await this.client.sendResourceToServer({
      resource: "tabs",
      correlationId,
      tabs,
    });
  }

  private async sendTabsContent(
    correlationId: string,
    tabId: number,
    offset?: number,
    selector?: string,
    includeLinks?: boolean,
    maxLength?: number
  ): Promise<void> {
    const MAX_CONTENT_LENGTH = maxLength ?? 5_000;
    const safeSelector = selector ? JSON.stringify(selector) : "null";
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const selector = ${safeSelector};
        const includeLinks = ${!!includeLinks};
        const offset = ${offset || 0};
        const maxLen = ${MAX_CONTENT_LENGTH};

        const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE']);
        const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'NAV',
          'HEADER', 'FOOTER', 'FORM', 'FIELDSET', 'TABLE', 'UL', 'OL', 'DL', 'BLOCKQUOTE',
          'PRE', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'ADDRESS']);
        const LANDMARK_TAGS = new Set(['MAIN', 'NAV', 'ASIDE', 'ARTICLE', 'HEADER', 'FOOTER', 'SECTION', 'FORM']);
        const LANDMARK_ROLES = { 'main': 'main', 'navigation': 'nav', 'complementary': 'aside',
          'banner': 'header', 'contentinfo': 'footer', 'form': 'form', 'region': 'section' };

        function isHidden(el) {
          if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return true;
          // Skip tiny decorative elements (color swatches, icons, etc.)
          if (el.children.length === 0 && el.tagName !== 'BR' && el.tagName !== 'HR' && el.tagName !== 'IMG') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.width < 10 && rect.height > 0 && rect.height < 10) return true;
          }
          return false;
        }

        function nodeToText(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.replace(/[ \\t]+/g, ' ');
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return '';
          const el = node;
          const tag = el.tagName;
          if (SKIP_TAGS.has(tag)) return '';
          if (isHidden(el)) return '';

          // Heading
          const hMatch = tag.match(/^H([1-6])$/);
          if (hMatch) {
            const level = parseInt(hMatch[1]);
            const text = el.textContent.trim();
            if (!text) return '';
            return '\\n\\n' + '#'.repeat(level) + ' ' + text + '\\n\\n';
          }

          // HR
          if (tag === 'HR') return '\\n\\n---\\n\\n';

          // BR
          if (tag === 'BR') return '\\n';

          // IMG
          if (tag === 'IMG') {
            const alt = el.getAttribute('alt');
            return alt ? '[image: ' + alt + ']' : '';
          }

          // List items
          if (tag === 'LI') {
            const parent = el.parentElement;
            const isOrdered = parent && parent.tagName === 'OL';
            const prefix = isOrdered
              ? (Array.from(parent.children).indexOf(el) + 1) + '. '
              : '- ';
            const inner = childrenToText(el);
            return '\\n' + prefix + inner.trim();
          }

          // Lists themselves just need surrounding newlines
          if (tag === 'UL' || tag === 'OL') {
            return '\\n' + childrenToText(el) + '\\n';
          }

          // Blockquote
          if (tag === 'BLOCKQUOTE') {
            const inner = childrenToText(el).trim();
            const lines = inner.split('\\n').map(l => '> ' + l).join('\\n');
            return '\\n\\n' + lines + '\\n\\n';
          }

          // Pre/code blocks
          if (tag === 'PRE') {
            return '\\n\\n\`\`\`\\n' + el.textContent + '\\n\`\`\`\\n\\n';
          }

          // Table
          if (tag === 'TABLE') {
            return '\\n\\n' + tableToText(el) + '\\n\\n';
          }

          // Inline formatting
          if (tag === 'STRONG' || tag === 'B') {
            const t = childrenToText(el).trim();
            return t ? '**' + t + '**' : '';
          }
          if (tag === 'EM' || tag === 'I') {
            const t = childrenToText(el).trim();
            return t ? '*' + t + '*' : '';
          }

          // Links — just show text; URLs are opt-in via includeLinks
          if (tag === 'A') {
            const t = childrenToText(el).trim();
            return t || '';
          }

          // Block elements get paragraph breaks
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
          // Trim each line and remove blank-only lines' whitespace
          text = text.split('\\n').map(l => l.trim()).join('\\n');
          // Collapse 2+ consecutive blank lines to one blank line
          text = text.replace(/\\n{3,}/g, '\\n\\n');
          return text.trim();
        }

        function getSectionLabel(el) {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          let label = LANDMARK_ROLES[role] || (LANDMARK_TAGS.has(el.tagName) ? tag : 'content');

          // Look for heading in first 2 levels of children
          const heading = el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > * > h1, :scope > * > h2, :scope > * > h3, :scope > * > h4, :scope > * > h5, :scope > * > h6');
          if (heading) {
            const hText = heading.textContent.trim().substring(0, 50);
            if (hText) label += ': ' + hText;
          } else {
            // Try aria-label or aria-labelledby
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

        // Selector mode: flat text with structural hints
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

        // Section mode: find landmarks
        const landmarkSelector = 'main, nav, aside, article, header, footer, section, form, [role="main"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"], [role="form"], [role="region"]';
        const landmarks = document.querySelectorAll(landmarkSelector);

        // Filter to top-level landmarks (not nested inside other landmarks)
        const topLandmarks = Array.from(landmarks).filter(el => {
          let parent = el.parentElement;
          while (parent) {
            if (parent.matches && parent.matches(landmarkSelector)) return false;
            parent = parent.parentElement;
          }
          return true;
        });

        if (topLandmarks.length === 0) {
          // No landmarks: single section fallback
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

        // Build sections from landmarks + content between them
        const landmarkSet = new Set(topLandmarks);
        const sections = [];
        let budget = maxLen;
        let totalLength = 0;
        let isTruncated = false;

        // Walk body's direct-ish children to find content between landmarks
        function processNode(node) {
          if (budget <= 0) { isTruncated = true; return; }
          if (node.nodeType === Node.TEXT_NODE) {
            const t = node.textContent.trim();
            if (t) {
              // Orphan text between landmarks
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

          // Check if any landmark is a descendant
          const hasLandmarkChild = node.querySelector && node.querySelector(landmarkSelector);
          if (hasLandmarkChild) {
            // Recurse into children
            for (const child of node.childNodes) {
              processNode(child);
              if (budget <= 0) break;
            }
          } else {
            // No landmarks inside — treat as content block
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

        // Apply offset across flattened sections
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
    `,
    });
    if (!results || !results[0]) {
      console.error(`[handler] executeScript returned no results for tab ${tabId}`);
      await this.client.sendErrorToServer(correlationId, `executeScript returned no results for tab ${tabId} — the tab may have been closed or navigated to a restricted page`);
      return;
    }
    const { isTruncated, fullText, sections, links, totalLength, selectorNotFound } = results[0];
    if (selectorNotFound) {
      await this.client.sendErrorToServer(correlationId, `Selector not found: ${selector}`);
      return;
    }
    await this.client.sendResourceToServer({
      resource: "tab-content",
      tabId,
      correlationId,
      isTruncated,
      fullText: fullText || undefined,
      sections: sections || undefined,
      links: links || undefined,
      totalLength,
    });
  }

  private async searchTabContent(
    correlationId: string,
    tabId: number,
    query: string,
    contextChars?: number
  ): Promise<void> {
    const safeQuery = JSON.stringify(query);
    const ctx = contextChars ?? 200;
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const query = ${safeQuery}.toLowerCase();
        const ctx = ${ctx};
        const text = document.body.innerText;
        const lower = text.toLowerCase();
        const matches = [];
        let pos = 0;
        while (matches.length < 50) {
          const idx = lower.indexOf(query, pos);
          if (idx === -1) break;
          const start = Math.max(0, idx - ctx);
          const end = Math.min(text.length, idx + query.length + ctx);
          matches.push({ context: text.substring(start, end), index: idx });
          pos = idx + query.length;
        }
        return matches;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "search-tab-content-result",
      correlationId,
      matches: results[0] || [],
    });
  }

  private async getInteractiveElements(
    correlationId: string,
    tabId: number
  ): Promise<void> {
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const selectors = 'a[href], button, input, textarea, select, [role="button"], [onclick], [tabindex]';
        const els = document.querySelectorAll(selectors);
        const seen = new Set();
        const elements = [];

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

        function uniqueSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);

          // Build a base selector for this element
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

          // If base is unique, use it
          if (document.querySelectorAll(base).length === 1) return base;

          // Try adding value attribute
          if (el.value && el.tagName === 'INPUT') {
            const withVal = base + '[value="' + CSS.escape(el.value) + '"]';
            if (document.querySelectorAll(withVal).length === 1) return withVal;
          }

          // Walk up ancestors to build a unique nth-child path
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
        }

        for (const el of els) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (el.offsetParent === null && el.tagName !== 'BODY') continue;

          const selector = uniqueSelector(el);
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

          if (semType === 'checkbox' || semType === 'radio') {
            entry.value = el.checked ? 'checked' : 'unchecked';
          } else if (semType === 'dropdown') {
            const opt = el.options && el.options[el.selectedIndex];
            if (opt) entry.value = opt.text;
          } else if (semType !== 'password input' && el.value) {
            entry.value = el.value.substring(0, 100);
          }

          if (el.placeholder) entry.placeholder = el.placeholder;

          const ctx = getNearestHeading(el);
          if (ctx) entry.context = ctx;

          elements.push(entry);
        }
        return elements;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "interactive-elements",
      correlationId,
      elements: results[0] || [],
    });
  }

  private async clickElement(
    correlationId: string,
    tabId: number,
    selector: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const tabBefore = await browser.tabs.get(tabId);
    const urlBefore = tabBefore.url;
    const safeSelector = JSON.stringify(selector);
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector(${safeSelector});
        if (!el) return { success: false, error: "Element not found" };
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return { success: false, error: "Element not visible (zero dimensions)" };
        if (el.offsetParent === null && el.tagName !== 'BODY') return { success: false, error: "Element not visible (hidden)" };
        if (el.disabled) return { success: false, error: "Element is disabled" };
        el.click();
        return { success: true };
      })();
    `,
    });

    const result = results[0] || {
      success: false,
      error: "Script execution failed",
    };

    let navigated = false;
    let url: string | undefined;
    let title: string | undefined;

    if (result.success) {
      await waitForPossibleNavigation(tabId);
      try {
        const tabAfter = await browser.tabs.get(tabId);
        url = tabAfter.url;
        title = tabAfter.title;
        navigated = url !== urlBefore;
      } catch {
        // tab may have closed
      }
    }

    await this.client.sendResourceToServer({
      resource: "element-clicked",
      correlationId,
      success: result.success,
      navigated,
      url,
      title,
      error: result.error,
    });
  }

  private async typeIntoField(
    correlationId: string,
    tabId: number,
    selector: string,
    text: string,
    clearFirst: boolean,
    submit: boolean
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeSelector = JSON.stringify(selector);
    const safeText = JSON.stringify(text);
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector(${safeSelector});
        if (!el) return false;
        el.focus();
        const text = ${safeText};
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
    `,
    });

    const success = !!results[0];

    if (success && submit) {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "text-typed",
      correlationId,
      success,
    });
  }

  private async pressKey(
    correlationId: string,
    tabId: number,
    key: string,
    selector?: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeKey = JSON.stringify(key);
    const safeSelector = selector ? JSON.stringify(selector) : "null";
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const selector = ${safeSelector};
        const target = selector ? document.querySelector(selector) : (document.activeElement || document.body);
        if (!target) return false;
        const key = ${safeKey};
        const opts = { key: key, bubbles: true, cancelable: true };
        target.dispatchEvent(new KeyboardEvent('keydown', opts));
        target.dispatchEvent(new KeyboardEvent('keypress', opts));
        target.dispatchEvent(new KeyboardEvent('keyup', opts));
        if (key === 'Enter') {
          const form = target.closest ? target.closest('form') : null;
          if (form) form.requestSubmit();
        }
        return true;
      })();
    `,
    });

    const success = !!results[0];

    if (success && key === "Enter") {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "key-pressed",
      correlationId,
      success,
    });
  }

  private async getTabInfo(
    correlationId: string,
    tabId: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    await this.client.sendResourceToServer({
      resource: "tab-info",
      correlationId,
      tabId,
      url: tab.url || "",
      title: tab.title || "",
      status: tab.status || "unknown",
    });
  }

  private async fillForm(
    correlationId: string,
    tabId: number,
    fields: { selector: string; value: string }[],
    submit?: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeFields = JSON.stringify(fields);
    const safeSubmit = submit ? JSON.stringify(submit) : "null";
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const fields = ${safeFields};
        const submitSelector = ${safeSubmit};
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
    `,
    });

    const result = results[0] || { results: [], submitted: false };

    if (result.submitted) {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "form-filled",
      correlationId,
      results: result.results,
      submitted: result.submitted,
    });
  }

  private async waitForSelector(
    correlationId: string,
    tabId: number,
    selector: string,
    timeoutMs?: number
  ): Promise<void> {
    const timeout = timeoutMs ?? 5000;
    const safeSelector = JSON.stringify(selector);
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      new Promise((resolve) => {
        const selector = ${safeSelector};
        const timeout = ${timeout};
        const existing = document.querySelector(selector);
        if (existing) {
          resolve({ found: true });
          return;
        }
        let resolved = false;
        const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            resolved = true;
            observer.disconnect();
            resolve({ found: true });
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => {
          if (!resolved) {
            observer.disconnect();
            resolve({ found: false });
          }
        }, timeout);
      });
    `,
    });

    const result = results[0] || { found: false };

    await this.client.sendResourceToServer({
      resource: "selector-found",
      correlationId,
      found: result.found,
    });
  }

  private async selectOption(
    correlationId: string,
    tabId: number,
    selector: string,
    value: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeSelector = JSON.stringify(selector);
    const safeValue = JSON.stringify(value);
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector(${safeSelector});
        if (!el || el.tagName !== 'SELECT') return false;
        el.value = ${safeValue};
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "option-selected",
      correlationId,
      success: !!results[0],
    });
  }
}
