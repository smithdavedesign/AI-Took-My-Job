export interface ReplayCookieRecord {
  name: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expiresAt?: string | null;
}

export interface ReplayStep {
  order: number;
  startedAt?: string;
  method: string;
  url: string;
  hostname: string;
  pathname: string;
  queryKeys: string[];
  requestHeaderKeys: string[];
  cookieNames: string[];
  isThirdParty: boolean;
  authRefreshCandidate: boolean;
  responseStatus: number;
  responseMimeType?: string;
  requestBodySize?: number;
  responseBodySize?: number;
}

export interface ReplayStorageSnapshotSummary {
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  cookieNames?: string[];
  cookies?: ReplayCookieRecord[];
}

export interface ReplayExecutionStepResult {
  order: number;
  method: string;
  url: string;
  expectedStatus: number;
  actualStatus?: number;
  durationMs?: number;
  result: 'matched' | 'mismatched' | 'network-error' | 'skipped-third-party';
  errorMessage?: string;
}

export interface ReplayExecutionResult {
  executedAt: string;
  status: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  executionMode?: 'browser-context' | 'request-context';
  isolatedThirdPartyRequests: number;
  failingStepOrders: number[];
  matchedFailingStepOrders: number[];
  resolvedStateReferenceCount: number;
  restoredCookieNames: string[];
  restoredCookies?: ReplayCookieRecord[];
  restoredLocalStorageKeys: string[];
  restoredSessionStorageKeys: string[];
  stepResults: ReplayExecutionStepResult[];
}

export interface ReplayPlan {
  entryUrl?: string;
  pageRefs: string[];
  requestCount: number;
  distinctHostnames: string[];
  thirdPartyHostnames: string[];
  steps: ReplayStep[];
  authSignals: string[];
  authRefreshPaths: string[];
  dataDependencies: string[];
  storageState: ReplayStorageSnapshotSummary;
  execution?: ReplayExecutionResult;
}

export interface StoredReplayRun {
  id: string;
  feedbackReportId: string;
  artifactId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  summary: Record<string, unknown>;
  replayPlan?: ReplayPlan;
  failureReason?: string;
}