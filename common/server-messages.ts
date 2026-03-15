export interface ServerMessageBase {
  cmd: string;
}

export interface OpenLinkServerMessage extends ServerMessageBase {
  cmd: "open-link";
  url: string;
  tabId?: number;
  newTab?: boolean;
}

export interface CloseTabsServerMessage extends ServerMessageBase {
  cmd: "close-tabs";
  tabIds: number[];
}

export interface GetTabListServerMessage extends ServerMessageBase {
  cmd: "get-tab-list";
}

export interface GetTabContentServerMessage extends ServerMessageBase {
  cmd: "get-tab-content";
  tabId: number;
  offset?: number;
  selector?: string;
  includeLinks?: boolean;
  maxLength?: number;
}

export interface SearchTabContentServerMessage extends ServerMessageBase {
  cmd: "search-tab-content";
  tabId: number;
  query: string;
  contextChars?: number;
}

export interface GetInteractiveElementsServerMessage extends ServerMessageBase {
  cmd: "get-interactive-elements";
  tabId: number;
}

export interface ClickElementServerMessage extends ServerMessageBase {
  cmd: "click-element";
  tabId: number;
  selector: string;
}

export interface TypeIntoFieldServerMessage extends ServerMessageBase {
  cmd: "type-into-field";
  tabId: number;
  selector: string;
  text: string;
  clearFirst?: boolean;
  submit?: boolean;
}

export interface PressKeyServerMessage extends ServerMessageBase {
  cmd: "press-key";
  tabId: number;
  key: string;
  selector?: string;
}

export interface SelectOptionServerMessage extends ServerMessageBase {
  cmd: "select-option";
  tabId: number;
  selector: string;
  value: string;
}

export interface ClickElementByTextServerMessage extends ServerMessageBase {
  cmd: "click-element-by-text";
  tabId: number;
  text: string;
  tag?: string;
}

export interface GetTabInfoServerMessage extends ServerMessageBase {
  cmd: "get-tab-info";
  tabId: number;
}

export interface FillFormServerMessage extends ServerMessageBase {
  cmd: "fill-form";
  tabId: number;
  fields: { selector: string; value?: string; checked?: boolean }[];
  submit?: string;
}

export interface WaitForSelectorServerMessage extends ServerMessageBase {
  cmd: "wait-for-selector";
  tabId: number;
  selector: string;
  timeoutMs?: number;
}

export type ServerMessage =
  | OpenLinkServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetTabContentServerMessage
  | SearchTabContentServerMessage
  | GetInteractiveElementsServerMessage
  | ClickElementServerMessage
  | TypeIntoFieldServerMessage
  | PressKeyServerMessage
  | SelectOptionServerMessage
  | ClickElementByTextServerMessage
  | GetTabInfoServerMessage
  | FillFormServerMessage
  | WaitForSelectorServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
