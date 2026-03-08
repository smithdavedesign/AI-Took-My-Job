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