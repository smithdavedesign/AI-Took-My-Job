#!/usr/bin/env bash
# Shared by scripts/gstack-*.sh. The RepoHQ coding brief is injected into the worktree's
# CLAUDE.md before the agent runs (step G5) so gstack reads it natively. It is *runtime
# context*: its "Last push" timestamp changes every run, so committing it made every agent
# PR rewrite CLAUDE.md and conflict with the next one (Github-HQ #7/#8).
#
# strip_repohq_brief runs on EXIT (registered right after `cd "$WORKTREE"`):
#   - CLAUDE.md differs from HEAD only by brief blocks → restore the HEAD version exactly
#   - the agent made real CLAUDE.md edits → keep them, drop only the brief block
#   - CLAUDE.md didn't exist at HEAD and holds only the brief → delete it

strip_repohq_brief() {
  local wt="$1"
  WT="$wt" node -e '
    const fs = require("fs"), cp = require("child_process"), path = require("path");
    const wt = process.env.WT, f = path.join(wt, "CLAUDE.md");
    if (!fs.existsSync(f)) process.exit(0);
    const current = fs.readFileSync(f, "utf8");
    if (!current.includes("<!-- repohq-brief-start -->")) process.exit(0);
    const strip = s => s.replace(/\n*<!-- repohq-brief-start -->[\s\S]*?<!-- repohq-brief-end -->\n?/g, "").trimEnd();
    let tracked = null;
    try { tracked = cp.execFileSync("git", ["-C", wt, "show", "HEAD:CLAUDE.md"], { stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch {}
    if (tracked !== null && strip(current) === strip(tracked)) fs.writeFileSync(f, tracked);
    else if (tracked === null && strip(current) === "") fs.unlinkSync(f);
    else fs.writeFileSync(f, strip(current) + "\n");
  ' 2>/dev/null || true
}
