import { elementCheckFn, typeIntoElementFn } from "./dom-utils";

export const typeIntoFieldScript = (
  selector: string,
  text: string,
  clearFirst: boolean,
  submit: boolean
) => `
(function() {
  ${elementCheckFn}
  ${typeIntoElementFn}
  var el = document.querySelector(${JSON.stringify(selector)});
  var check = checkElement(el, ${JSON.stringify(selector)});
  if (check) return check;
  el.focus();
  typeIntoElement(el, ${JSON.stringify(text)}, ${clearFirst});
  if (${submit}) {
    var form = el.closest ? el.closest('form') : null;
    if (form) form.requestSubmit();
  }
  return { success: true };
})();
`;
