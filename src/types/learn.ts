export type RolloutStepStatus = 'not-started' | 'in-progress' | 'complete';

export interface StoredRolloutStepState {
  status: RolloutStepStatus;
  note: string;
}

export interface StoredProjectRolloutChecklistSteps {
  pilot: StoredRolloutStepState;
  connect: StoredRolloutStepState;
  launch: StoredRolloutStepState;
  operate: StoredRolloutStepState;
  promote: StoredRolloutStepState;
}

export interface StoredProjectRolloutChecklist {
  id: string;
  projectId: string;
  steps: StoredProjectRolloutChecklistSteps;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}