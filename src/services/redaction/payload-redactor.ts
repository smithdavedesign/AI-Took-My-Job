export interface RedactionResult<T> {
  value: T;
  redactionCount: number;
}

interface RedactionState {
  replacements: Map<string, string>;
  counts: Map<string, number>;
  redactionCount: number;
}

function nextPlaceholder(state: RedactionState, prefix: string, rawValue: string): string {
  const existing = state.replacements.get(rawValue);
  if (existing) {
    return existing;
  }

  const nextCount = (state.counts.get(prefix) ?? 0) + 1;
  state.counts.set(prefix, nextCount);
  const placeholder = `[${prefix}_${nextCount}]`;
  state.replacements.set(rawValue, placeholder);
  state.redactionCount += 1;
  return placeholder;
}

function redactString(input: string, state: RedactionState): string {
  const rules: Array<{ pattern: RegExp; prefix: string }> = [
    { pattern: /github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+/g, prefix: 'GITHUB_TOKEN' },
    { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, prefix: 'BEARER_TOKEN' },
    { pattern: /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, prefix: 'JWT' },
    { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, prefix: 'EMAIL' },
    { pattern: /AKIA[0-9A-Z]{16}/g, prefix: 'AWS_ACCESS_KEY' }
  ];

  let output = input.replace(/([?&](token|auth|key|apikey|api_key|access_token)=)([^&#\s]+)/gi, (_match, prefix: string, _key: string, secretValue: string) => {
    return `${prefix}${nextPlaceholder(state, 'URL_SECRET', secretValue)}`;
  });

  for (const rule of rules) {
    output = output.replace(rule.pattern, (match) => nextPlaceholder(state, rule.prefix, match));
  }

  return output;
}

function redactUnknown<T>(value: T, state: RedactionState): T {
  if (typeof value === 'string') {
    return redactString(value, state) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, state)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, redactUnknown(nestedValue, state)])
    ) as T;
  }

  return value;
}

export function redactPayload<T>(value: T): RedactionResult<T> {
  const state: RedactionState = {
    replacements: new Map(),
    counts: new Map(),
    redactionCount: 0
  };

  return {
    value: redactUnknown(value, state),
    redactionCount: state.redactionCount
  };
}