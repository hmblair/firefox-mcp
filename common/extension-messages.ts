export interface ExtensionMessageBase {
  resource: string;
  correlationId: string;
}

export interface ContentSection {
  label: string;
  content: string;
}

export interface TabContentExtensionMessage extends ExtensionMessageBase {
  resource: "tab-content";
  tabId: number;
  fullText?: string;
  sections?: ContentSection[];
  isTruncated: boolean;
  totalLength: number;
  links?: { url: string; text: string }[];
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
  type: string;
  label?: string;
  href?: string;
  value?: string;
  placeholder?: string;
  context?: string;
  enabled: boolean;
  options?: { value: string; text: string }[];
  optionsTruncated?: boolean;
}

export interface InteractiveElementsExtensionMessage extends ExtensionMessageBase {
  resource: "interactive-elements";
  elements: InteractiveElement[];
}

export interface ElementClickedExtensionMessage extends ExtensionMessageBase {
  resource: "element-clicked";
  success: boolean;
  navigated?: boolean;
  url?: string;
  title?: string;
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
  error?: string;
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

export interface ScreenshotExtensionMessage extends ExtensionMessageBase {
  resource: "screenshot";
  dataUrl: string;
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
  | TabInfoExtensionMessage
  | FormFilledExtensionMessage
  | SelectorFoundExtensionMessage
  | ScreenshotExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
}
