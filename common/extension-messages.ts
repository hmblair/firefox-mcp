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

export interface SearchMatch {
  context: string;
  index: number;
}

export interface SearchTabContentExtensionMessage extends ExtensionMessageBase {
  resource: "search-tab-content-result";
  matches: SearchMatch[];
}

export interface TabsClosedExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-closed";
  closedTabIds: number[];
  failedTabIds: number[];
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
  error?: string;
}

export interface ElementClickedByTextExtensionMessage
  extends ExtensionMessageBase {
  resource: "element-clicked-by-text";
  success: boolean;
  clickedText?: string;
  clickedTag?: string;
  href?: string;
  matchCount?: number;
  error?: string;
}

export interface TextTypedExtensionMessage extends ExtensionMessageBase {
  resource: "text-typed";
  success: boolean;
}

export interface KeyPressedExtensionMessage extends ExtensionMessageBase {
  resource: "key-pressed";
  success: boolean;
}

export interface OptionSelectedExtensionMessage extends ExtensionMessageBase {
  resource: "option-selected";
  success: boolean;
}

export interface TabInfoExtensionMessage extends ExtensionMessageBase {
  resource: "tab-info";
  tabId: number;
  url: string;
  title: string;
  status: string;
}

export interface FormFilledExtensionMessage extends ExtensionMessageBase {
  resource: "form-filled";
  results: { selector: string; success: boolean; error?: string }[];
  submitted: boolean;
}

export interface SelectorFoundExtensionMessage extends ExtensionMessageBase {
  resource: "selector-found";
  found: boolean;
}

export type ExtensionMessage =
  | TabContentExtensionMessage
  | TabsExtensionMessage
  | OpenedTabIdExtensionMessage
  | SearchTabContentExtensionMessage
  | TabsClosedExtensionMessage
  | InteractiveElementsExtensionMessage
  | ElementClickedExtensionMessage
  | TextTypedExtensionMessage
  | KeyPressedExtensionMessage
  | OptionSelectedExtensionMessage
  | ElementClickedByTextExtensionMessage
  | TabInfoExtensionMessage
  | FormFilledExtensionMessage
  | SelectorFoundExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
}
