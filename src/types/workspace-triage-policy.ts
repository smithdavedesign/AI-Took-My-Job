export type TriagePolicyMatchField = 'title' | 'reporter' | 'repository' | 'page-host' | 'label' | 'severity' | 'source' | 'owner';

export type TriagePolicyMatchOperator = 'equals' | 'contains' | 'starts-with';

export interface WorkspaceOwnershipRule {
  id: string;
  field: Exclude<TriagePolicyMatchField, 'owner'>;
  operator: TriagePolicyMatchOperator;
  value: string;
  owner: string;
  scoreBoost: number;
  reason?: string;
}

export interface WorkspacePriorityRule {
  id: string;
  field: TriagePolicyMatchField;
  operator: TriagePolicyMatchOperator;
  value: string;
  scoreDelta: number;
  reason?: string;
}

export interface StoredWorkspaceTriagePolicy {
  id: string;
  workspaceId: string;
  ownershipRules: WorkspaceOwnershipRule[];
  priorityRules: WorkspacePriorityRule[];
  createdAt?: string;
  updatedAt?: string;
}