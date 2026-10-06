export const DEFAULT_AUTONOMOUS_BASE_BRANCH = 'integration/agent';
export const AUTONOMOUS_BRANCH_PREFIX = 'feature/bot';

const AUTONOMOUS_SOURCES = new Set([
  'repohq-advisor',
  'repohq-auto-dispatch',
  'repohq-gstack-ui',
  'skill-chain',
  'gstack-self-scan',
  'ci-fix',
  'mcp'
]);

export interface ParsedTaskContextNotes {
  autoExecute: boolean;
  source?: string;
  skillName?: string;
  existingBranch?: string;
  preferredBaseBranch?: string;
}

function sanitizeBranchSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-./]+|[-./]+$/g, '')
    .slice(0, 48) || 'task';
}

export function parseTaskContextNotes(contextNotes?: string | null): ParsedTaskContextNotes {
  if (!contextNotes?.trim()) {
    return { autoExecute: false };
  }

  try {
    const parsed = JSON.parse(contextNotes) as Record<string, unknown>;
    return {
      autoExecute: parsed.autoExecute === true,
      ...(typeof parsed.source === 'string' ? { source: parsed.source } : {}),
      ...(typeof parsed.skillName === 'string' ? { skillName: parsed.skillName } : {}),
      ...(typeof parsed.existingBranch === 'string' ? { existingBranch: parsed.existingBranch } : {}),
      ...(typeof parsed.preferredBaseBranch === 'string' ? { preferredBaseBranch: parsed.preferredBaseBranch } : {})
    };
  } catch {
    return { autoExecute: false };
  }
}

export function isAutonomousTaskContext(notes: ParsedTaskContextNotes): boolean {
  if (notes.autoExecute) {
    return true;
  }

  return typeof notes.source === 'string' && AUTONOMOUS_SOURCES.has(notes.source);
}

export function buildAutonomousBranchName(agentTaskId: string, executionId: string): string {
  const task = sanitizeBranchSegment(agentTaskId).slice(0, 8);
  const execution = sanitizeBranchSegment(executionId).slice(0, 8);
  return `${AUTONOMOUS_BRANCH_PREFIX}/${task}-${execution}`;
}

export function resolveAutonomousBaseBranch(configuredBaseBranch?: string): string {
  const candidate = configuredBaseBranch?.trim();
  return candidate && candidate.length > 0 ? candidate : DEFAULT_AUTONOMOUS_BASE_BRANCH;
}

export function assertAutonomousPromotionBranchPolicy(input: {
  isAutonomous: boolean;
  baseBranch?: string;
  integrationBaseBranch?: string;
}): void {
  if (!input.isAutonomous) {
    return;
  }

  const normalizedBase = (input.baseBranch ?? '').trim().toLowerCase();
  if (normalizedBase !== 'main') {
    return;
  }

  const expected = resolveAutonomousBaseBranch(input.integrationBaseBranch);
  throw new Error(
    `autonomous promotion policy violation: autonomous PRs may not target main; use ${expected} and promote to main via human-reviewed release PR`
  );
}
