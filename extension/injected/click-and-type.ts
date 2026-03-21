import { elementCheckFn, typeIntoElementFn } from "./dom-utils";

export const clickAndTypeScript = (
  selector: string,
  text: string,
  clearFirst: boolean,
  submit: boolean
) => `
(async function() {
  ${elementCheckFn}
  ${typeIntoElementFn}
  var el = document.querySelector(${JSON.stringify(selector)});
  var check = checkElement(el, ${JSON.stringify(selector)});
  if (check) return check;
  el.click();
  await new Promise(r => setTimeout(r, 50));
  var active = document.activeElement;
  if (!active || active === document.body) {
    return { success: false, error: 'No element received focus after clicking "' + ${JSON.stringify(selector)} + '"' };
  }
  if (typeof active.value === 'undefined') {
    return { success: false, error: 'Focused element is not a text input (got <' + active.tagName.toLowerCase() + '>)' };
  }
  typeIntoElement(active, ${JSON.stringify(text)}, ${clearFirst});
  if (${submit}) {
    var form = active.closest ? active.closest('form') : null;
    if (form) form.requestSubmit();
  }
  return { success: true };
})();
`;
