export const clickElementScript = (selector: string) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { success: false, error: "Element not found" };
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return { success: false, error: "Element not visible (zero dimensions)" };
  if (el.offsetParent === null && el.tagName !== 'BODY') return { success: false, error: "Element not visible (hidden)" };
  if (el.disabled) return { success: false, error: "Element is disabled" };
  el.click();
  return { success: true };
})();
`;
