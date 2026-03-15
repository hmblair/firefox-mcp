export interface ServerMessageBase {
  cmd: string;
}

export interface OpenTabServerMessage extends ServerMessageBase {
  cmd: "open-tab";
  url: string;
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

export interface FindHighlightServerMessage extends ServerMessageBase {
  cmd: "find-highlight";
  tabId: number;
  queryPhrase: string;
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

export type ServerMessage =
  | OpenTabServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | GetTabContentServerMessage
  | GetPageOutlineServerMessage
  | ReorderTabsServerMessage
  | FindHighlightServerMessage
  | GetInteractiveElementsServerMessage
  | ClickElementServerMessage
  | TypeIntoFieldServerMessage
  | PressKeyServerMessage
  | SelectOptionServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
