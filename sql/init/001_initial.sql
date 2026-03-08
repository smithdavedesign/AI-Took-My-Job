CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS feedback_reports (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  severity TEXT NOT NULL DEFAULT 'unknown',
  reporter_identifier TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_reports_source_idx
  ON feedback_reports (source, received_at DESC);

CREATE TABLE IF NOT EXISTS artifact_bundles (
  id UUID PRIMARY KEY,
  feedback_report_id UUID NOT NULL REFERENCES feedback_reports(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triage_jobs (
  id UUID PRIMARY KEY,
  feedback_report_id UUID NOT NULL REFERENCES feedback_reports(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 50,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS github_issue_links (
  id UUID PRIMARY KEY,
  feedback_report_id UUID NOT NULL UNIQUE REFERENCES feedback_reports(id) ON DELETE CASCADE,
  repository TEXT NOT NULL,
  draft_title TEXT NOT NULL,
  draft_body TEXT NOT NULL,
  draft_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  issue_number INTEGER,
  issue_url TEXT,
  state TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_type_idx
  ON audit_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS replay_runs (
  id UUID PRIMARY KEY,
  feedback_report_id UUID NOT NULL REFERENCES feedback_reports(id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL REFERENCES artifact_bundles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  replay_plan JSONB,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS replay_runs_report_idx
  ON replay_runs (feedback_report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY,
  feedback_report_id UUID NOT NULL REFERENCES feedback_reports(id) ON DELETE CASCADE,
  processing_job_id UUID,
  requested_by TEXT NOT NULL,
  target_repository TEXT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  execution_mode TEXT NOT NULL DEFAULT 'fix',
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_notes TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  prepared_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_tasks_report_idx
  ON agent_tasks (feedback_report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_task_executions (
  id UUID PRIMARY KEY,
  agent_task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  processing_job_id UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  branch_name TEXT,
  base_branch TEXT,
  worktree_path TEXT,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  patch_summary TEXT,
  pull_request_url TEXT,
  validation_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_task_executions_task_idx
  ON agent_task_executions (agent_task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_task_replay_validations (
  id UUID PRIMARY KEY,
  agent_task_execution_id UUID NOT NULL UNIQUE REFERENCES agent_task_executions(id) ON DELETE CASCADE,
  replay_run_id UUID REFERENCES replay_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'failed',
  expectation TEXT NOT NULL,
  target_origin TEXT,
  baseline_status TEXT,
  actual_status TEXT,
  baseline_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  post_change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_task_replay_validations_execution_idx
  ON agent_task_replay_validations (agent_task_execution_id);