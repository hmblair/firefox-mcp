export const sendKeypressScript = (key: string, modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }) => `
(function() {
  const el = document.activeElement || document.body;
  const opts = {
    key: ${JSON.stringify(key)},
    bubbles: true,
    cancelable: true,
    ctrlKey: ${!!modifiers.ctrl},
    shiftKey: ${!!modifiers.shift},
    altKey: ${!!modifiers.alt},
    metaKey: ${!!modifiers.meta},
  };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
  return { success: true };
})();
`;
