import { elementCheckFn } from "./dom-utils";

export const clickElementScript = (selector: string) => `
(function() {
  ${elementCheckFn}
  var el = document.querySelector(${JSON.stringify(selector)});
  var check = checkElement(el, ${JSON.stringify(selector)});
  if (check) return check;
  el.click();
  return { success: true };
})();
`;
