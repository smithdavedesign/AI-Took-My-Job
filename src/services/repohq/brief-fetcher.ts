/**
 * Fetches a RepoHQ coding brief for a repository.
 *
 * Calls the RepoHQ MCP server's get_coding_brief tool by querying
 * the Neon database directly (same approach as the MCP server itself).
 * Falls back gracefully if RepoHQ is not configured.
 */

import type { AppConfig } from '../../support/config.js';

export interface RepoHQBrief {
  repoName: string;
  health: number | null;
  lifecycle: string | null;
  focused: boolean;
  purpose: string | null;
  techDebt: string | null;
  advisorAction: string | null;
  recentSessions: Array<{ agent: string; summary: string; date: string }>;
  securityAlerts: number;
  goal: string | null;
  raw: string;  // full markdown brief for pasting into prompt
}

export async function fetchRepoHQBrief(
  config: AppConfig,
  repoName: string,
): Promise<RepoHQBrief | null> {
  if (!config.REPOHQ_MCP_DATABASE_URL || !config.REPOHQ_MCP_USER_ID) {
    return null;
  }

  try {
    // Query Neon directly — same pattern as mcp/server.ts
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(config.REPOHQ_MCP_DATABASE_URL);

    const [repoRow] = await sql`
      SELECT
        r.id,
        r.name,
        r.lifecycle_status,
        r.is_focused,
        r.purpose,
        r.estimated_effort,
        r.mrr,
        r.abandonment_reason,
        m.health_score,
        m.activity_score,
        m.security_score,
        m.activity_status,
        m.build_status,
        m.last_push,
        m.opportunity_score,
        (SELECT COUNT(*) FROM security_findings sf WHERE sf.repo_id = r.id AND sf.state = 'open' AND sf.severity IN ('critical','high')) AS critical_alerts,
        ts.frontend,
        ts.backend,
        ts.database,
        ts.hosting,
        ts.language,
        ts.testing,
        ca.title AS claude_analysis_title
      FROM repositories r
      LEFT JOIN repository_metrics m ON m.repo_id = r.id
      LEFT JOIN tech_stack ts ON ts.repo_id = r.id
      LEFT JOIN LATERAL (
        SELECT (claude_analysis->>'techDebt')::jsonb->>'level' AS title
        FROM repositories WHERE id = r.id
      ) ca ON true
      WHERE r.user_id = ${config.REPOHQ_MCP_USER_ID}
        AND r.name = ${repoName}
      LIMIT 1
    `;

    if (!repoRow) return null;

    // Recent sessions
    const sessions = await sql`
      SELECT title, description, metadata, occurred_at
      FROM portfolio_events
      WHERE user_id = ${config.REPOHQ_MCP_USER_ID}
        AND repo_id = ${repoRow.id}
        AND event_type = 'session_complete'
      ORDER BY occurred_at DESC
      LIMIT 3
    `;

    // Active goals
    const goals = await sql`
      SELECT name, current_value, target_value, unit
      FROM goals
      WHERE user_id = ${config.REPOHQ_MCP_USER_ID}
        AND is_active = true
      LIMIT 3
    `;

    const recentSessions = sessions.map((s: Record<string, unknown>) => {
      const meta = (s.metadata ?? {}) as Record<string, unknown>;
      return {
        agent: String(meta.agent ?? 'unknown'),
        summary: String(s.description ?? s.title ?? ''),
        date: String(s.occurred_at ?? new Date().toISOString()).split('T')[0]!,
      };
    });

    const goalText = goals.length > 0
      ? goals.map((g: Record<string, unknown>) => `${g.name}: ${g.current_value}/${g.target_value} ${g.unit ?? ''}`).join(', ')
      : null;

    const health = repoRow.health_score != null ? Math.round(Number(repoRow.health_score)) : null;
    const secAlerts = Number(repoRow.critical_alerts ?? 0);

    // Build the markdown brief (same format as MCP get_coding_brief)
    const lines = [
      `# ${repoRow.name} — RepoHQ Coding Brief`,
      `_Portfolio context provided by RepoHQ_`,
      ``,
      `## Status`,
      `- Lifecycle: ${repoRow.lifecycle_status ?? 'unknown'}`,
      `- Focus: ${repoRow.is_focused ? '⭐ Focused' : 'Not focused'}`,
      `- Purpose: ${repoRow.purpose ?? 'not set'}`,
      `- Health: ${health != null ? `${health}/100` : 'unknown'}`,
      `- Activity: ${repoRow.activity_status ?? 'unknown'}`,
      `- Last push: ${repoRow.last_push ? String(repoRow.last_push).split('T')[0] : 'unknown'}`,
      ``,
    ];

    const stack = [repoRow.frontend, repoRow.backend, repoRow.database, repoRow.hosting, repoRow.language, repoRow.testing]
      .filter(Boolean).join(' · ');
    if (stack) lines.push(`## Tech Stack`, stack, ``);

    if (goalText) lines.push(`## Active Goals`, goalText, ``);

    if (secAlerts > 0) lines.push(`## ⚠ Security`, `${secAlerts} open critical/high alerts`, ``);

    if (recentSessions.length > 0) {
      lines.push(`## Recent Sessions`);
      for (const s of recentSessions) {
        lines.push(`- **${s.date}** (${s.agent}): ${s.summary}`);
      }
      lines.push(``);
    }

    if (repoRow.lifecycle_status === 'sunsetting' || repoRow.lifecycle_status === 'archived') {
      lines.push(`> ⚠ This repo is ${String(repoRow.lifecycle_status).toUpperCase()} — avoid significant new investment.`);
      if (repoRow.abandonment_reason) lines.push(`> Reason: ${repoRow.abandonment_reason}`);
      lines.push(``);
    }

    return {
      repoName: String(repoRow.name),
      health,
      lifecycle: repoRow.lifecycle_status ? String(repoRow.lifecycle_status) : null,
      focused: Boolean(repoRow.is_focused),
      purpose: repoRow.purpose ? String(repoRow.purpose) : null,
      techDebt: repoRow.claude_analysis_title ? String(repoRow.claude_analysis_title) : null,
      advisorAction: null,
      recentSessions,
      securityAlerts: secAlerts,
      goal: goalText,
      raw: lines.join('\n'),
    };
  } catch (err) {
    // Never crash agent execution over a context fetch failure
    console.warn('[repohq-brief] failed to fetch brief:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Fire-and-forget webhook back to RepoHQ */
export async function notifyRepoHQ(
  config: AppConfig,
  payload: {
    eventType: 'agent_pr_created' | 'agent_pr_merged' | 'agent_execution_failed';
    taskId: string;
    repoName?: string;
    prUrl?: string;
    summary?: string;
    agentName?: string;
    durationMs?: number;
    filesChanged?: number;
    costUsd?: number;
  },
): Promise<void> {
  if (!config.REPOHQ_WEBHOOK_URL) return;

  try {
    await fetch(config.REPOHQ_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.REPOHQ_WEBHOOK_SECRET
          ? { 'x-nexus-webhook-secret': config.REPOHQ_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Never crash over a webhook failure
    console.warn('[repohq-webhook] failed to notify RepoHQ:', err instanceof Error ? err.message : err);
  }
}
