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

export interface GetBrowserRecentHistoryServerMessage extends ServerMessageBase {
  cmd: "get-browser-recent-history";
  searchQuery?: string;
}

export interface GetTabContentServerMessage extends ServerMessageBase {
  cmd: "get-tab-content";
  tabId: number;
  offset?: number;
  selector?: string;
  includeLinks?: boolean;
  maxLength?: number;
}

export interface GetPageOutlineServerMessage extends ServerMessageBase {
  cmd: "get-page-outline";
  tabId: number;
}

export interface ReorderTabsServerMessage extends ServerMessageBase {
  cmd: "reorder-tabs";
  tabOrder: number[];
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

export type ServerMessage =
  | OpenLinkServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | GetTabContentServerMessage
  | GetPageOutlineServerMessage
  | ReorderTabsServerMessage
  | SearchTabContentServerMessage
  | GetInteractiveElementsServerMessage
  | ClickElementServerMessage
  | TypeIntoFieldServerMessage
  | PressKeyServerMessage
  | SelectOptionServerMessage
  | ClickElementByTextServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
