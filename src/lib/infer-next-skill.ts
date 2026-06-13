/**
 * Keyword inference for the most likely next gstack skill after a report completes.
 * Pure function — no DB or network dependencies, safe to import in tests.
 * Mirrors RepoHQ's suggest-actions.ts logic so both sides agree on skill transitions.
 */

// Mirrors suggest-actions.ts PASSING_PREFIXES — prevents "0 failed" from triggering investigate.
const PASSING_PREFIXES = ['✅', '✓', '☑', 'passing', 'clean:', '0 errors', '0 issues', 'all tests'];

function stripPassingFindings(findings: string[]): string[] {
  return findings.filter(f => {
    const lower = f.trim().toLowerCase();
    return !PASSING_PREFIXES.some(p => lower.startsWith(p));
  });
}

export function inferNextSkill(skillName: string, findings: string[]): string | null {
  const text = stripPassingFindings(findings).join(' ').toLowerCase();
  if (['health', 'qa-only'].includes(skillName)) {
    if (text.includes('typescript') || text.includes('type error') || text.includes('ts error')) return 'ship';
    if (text.includes('dead code') || text.includes('never imported') || text.includes('unused export')) return 'ship';
    if (text.includes('no test') || text.includes('missing test') || text.includes('coverage gap')) return 'ship';
    if (text.includes('build fail') || text.includes('build error') || text.includes('module not found')) return 'investigate';
  }
  if (skillName === 'review') {
    if (text.includes('security') || text.includes('vulnerability') || text.includes('injection')) return 'investigate';
    if (text.includes('logic error') || text.includes('incorrect') || text.includes('bug')) return 'ship';
  }
  if (skillName === 'retro') {
    if (text.includes('tech debt') || text.includes('test') || text.includes('quality')) return 'ship';
  }
  if (skillName === 'investigate') {
    if (text.includes('fix') || text.includes('patch') || text.includes('should be changed') || text.includes('should update')) return 'ship';
    if (text.includes('race condition') || text.includes('memory leak') || text.includes('infinite loop')) return 'ship';
  }
  if (skillName === 'canary') {
    if (text.includes('error') || text.includes('exception') || text.includes('failed') || text.includes('timeout')) return 'investigate';
    if (text.includes('slow') || text.includes('perf') || text.includes('latency') || text.includes('memory')) return 'health';
  }
  if (skillName === 'qa') {
    if (text.includes('bug') || text.includes('broken') || text.includes('crash') || text.includes('regression')) return 'ship';
    if (text.includes('security') || text.includes('auth') || text.includes('xss') || text.includes('injection')) return 'investigate';
  }
  if (skillName === 'ship') {
    if (text.includes('deploy') || text.includes('production') || text.includes('release')) return 'canary';
    if (text.includes('test') || text.includes('coverage')) return 'qa-only';
  }
  if (skillName === 'document-release') {
    if (text.includes('outdated') || text.includes('missing') || text.includes('incomplete')) return 'ship';
  }
  return null;
}
