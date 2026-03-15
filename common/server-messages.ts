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
}

export type ServerMessage =
  | OpenTabServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | GetTabContentServerMessage
  | ReorderTabsServerMessage
  | FindHighlightServerMessage
  | GetInteractiveElementsServerMessage
  | ClickElementServerMessage
  | TypeIntoFieldServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
