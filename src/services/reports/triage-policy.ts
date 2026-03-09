import type { ProjectRepository } from '../../repositories/project-repository.js';
import type { WorkspaceTriagePolicyRepository } from '../../repositories/workspace-triage-policy-repository.js';
import type { StoredFeedbackReport } from '../../types/reports.js';
import type {
  StoredWorkspaceTriagePolicy,
  TriagePolicyMatchField,
  TriagePolicyMatchOperator,
  WorkspaceOwnershipRule,
  WorkspacePriorityRule
} from '../../types/workspace-triage-policy.js';

export interface TriagePolicyOwnershipMatch {
  label: string;
  score: number;
  reason: string;
}

export interface TriagePolicyPriorityMatch {
  ruleId: string;
  scoreDelta: number;
  reason: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matches(operator: TriagePolicyMatchOperator, candidate: string, expected: string): boolean {
  const actual = normalize(candidate);
  const target = normalize(expected);

  switch (operator) {
    case 'equals':
      return actual === target;
    case 'starts-with':
      return actual.startsWith(target);
    default:
      return actual.includes(target);
  }
}

function readPageHost(report: StoredFeedbackReport): string | null {
  const pageUrl = report.payload.pageUrl;
  if (typeof pageUrl !== 'string' || pageUrl.length === 0) {
    return null;
  }

  try {
    return new URL(pageUrl).hostname;
  } catch {
    return null;
  }
}

function readLabels(report: StoredFeedbackReport): string[] {
  const labels = report.payload.labels;
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function readCandidateValues(input: {
  field: TriagePolicyMatchField;
  report: StoredFeedbackReport;
  repository?: string | null | undefined;
  ownerLabels?: string[] | undefined;
}): string[] {
  switch (input.field) {
    case 'title':
      return input.report.title ? [input.report.title] : [];
    case 'reporter':
      return input.report.reporterIdentifier ? [input.report.reporterIdentifier] : [];
    case 'repository':
      return input.repository ? [input.repository] : [];
    case 'page-host': {
      const host = readPageHost(input.report);
      return host ? [host] : [];
    }
    case 'label':
      return readLabels(input.report);
    case 'severity':
      return [input.report.severity];
    case 'source':
      return [input.report.source];
    case 'owner':
      return input.ownerLabels ?? [];
    default:
      return [];
  }
}

function ruleMatches(input: {
  field: TriagePolicyMatchField;
  operator: TriagePolicyMatchOperator;
  value: string;
  report: StoredFeedbackReport;
  repository?: string | null | undefined;
  ownerLabels?: string[] | undefined;
}): boolean {
  const candidates = readCandidateValues({
    field: input.field,
    report: input.report,
    repository: input.repository,
    ownerLabels: input.ownerLabels
  });

  return candidates.some((candidate) => matches(input.operator, candidate, input.value));
}

export async function resolveWorkspaceTriagePolicyForReport(input: {
  report: StoredFeedbackReport;
  projects: ProjectRepository;
  workspaceTriagePolicies: WorkspaceTriagePolicyRepository;
}): Promise<StoredWorkspaceTriagePolicy | null> {
  if (!input.report.projectId) {
    return null;
  }

  const project = await input.projects.findById(input.report.projectId);
  if (!project) {
    return null;
  }

  return input.workspaceTriagePolicies.findByWorkspaceId(project.workspaceId);
}

export function evaluateOwnershipPolicyRules(input: {
  policy: StoredWorkspaceTriagePolicy | null | undefined;
  report: StoredFeedbackReport;
  repository: string | null | undefined;
}): TriagePolicyOwnershipMatch[] {
  const rules = input.policy?.ownershipRules ?? [];

  return rules
    .filter((rule) => ruleMatches({
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      report: input.report,
      repository: input.repository
    }))
    .map((rule: WorkspaceOwnershipRule) => ({
      label: rule.owner,
      score: rule.scoreBoost,
      reason: rule.reason ?? `workspace ownership policy matched ${rule.field} ${rule.operator} ${rule.value}`
    }));
}

export function evaluatePriorityPolicyRules(input: {
  policy: StoredWorkspaceTriagePolicy | null | undefined;
  report: StoredFeedbackReport;
  repository: string | null | undefined;
  ownerLabels: string[] | undefined;
}): { delta: number; matches: TriagePolicyPriorityMatch[] } {
  const rules = input.policy?.priorityRules ?? [];
  const matchesForPolicy = rules
    .filter((rule) => ruleMatches({
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      report: input.report,
      repository: input.repository,
      ownerLabels: input.ownerLabels
    }))
    .map((rule: WorkspacePriorityRule) => ({
      ruleId: rule.id,
      scoreDelta: rule.scoreDelta,
      reason: rule.reason ?? `workspace priority policy matched ${rule.field} ${rule.operator} ${rule.value}`
    }));

  const totalDelta = matchesForPolicy.reduce((sum, match) => sum + match.scoreDelta, 0);
  return {
    delta: Math.max(-25, Math.min(25, totalDelta)),
    matches: matchesForPolicy
  };
}