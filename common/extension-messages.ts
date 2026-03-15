export interface ExtensionMessageBase {
  resource: string;
  correlationId: string;
}

export interface TabContentExtensionMessage extends ExtensionMessageBase {
  resource: "tab-content";
  tabId: number;
  fullText: string;
  isTruncated: boolean;
  totalLength: number;
  links: { url: string; text: string }[];
}

export interface BrowserTab {
  id?: number;
  url?: string;
  title?: string;
  lastAccessed?: number;
}

export interface TabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs";
  tabs: BrowserTab[];
}

export interface OpenedTabIdExtensionMessage extends ExtensionMessageBase {
  resource: "opened-tab-id";
  tabId: number | undefined;
}

export interface BrowserHistoryItem {
  url?: string;
  title?: string;
  lastVisitTime?: number;
}

export interface BrowserHistoryExtensionMessage extends ExtensionMessageBase {
  resource: "history";

  historyItems: BrowserHistoryItem[];
}

export interface ReorderedTabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-reordered";
  tabOrder: number[];
}

export interface FindHighlightExtensionMessage extends ExtensionMessageBase {
  resource: "find-highlight-result";
  noOfResults: number;
}

export interface TabsClosedExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-closed";
}

export interface InteractiveElement {
  selector: string;
  tag: string;
  type?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  enabled: boolean;
}

export interface InteractiveElementsExtensionMessage extends ExtensionMessageBase {
  resource: "interactive-elements";
  elements: InteractiveElement[];
}

export interface ElementClickedExtensionMessage extends ExtensionMessageBase {
  resource: "element-clicked";
  success: boolean;
}

export interface TextTypedExtensionMessage extends ExtensionMessageBase {
  resource: "text-typed";
  success: boolean;
}

export type ExtensionMessage =
  | TabContentExtensionMessage
  | TabsExtensionMessage
  | OpenedTabIdExtensionMessage
  | BrowserHistoryExtensionMessage
  | ReorderedTabsExtensionMessage
  | FindHighlightExtensionMessage
  | TabsClosedExtensionMessage
  | InteractiveElementsExtensionMessage
  | ElementClickedExtensionMessage
  | TextTypedExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
}