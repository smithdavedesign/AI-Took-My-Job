# Simplified vNext Docs

This folder captures a simplification pass for Nexus focused on reducing setup complexity, narrowing the beginner use case, and separating advanced operator capabilities from the default product path.

## Included Documents

- [prd-vnext-outline.md](./prd-vnext-outline.md)
  - A compressed product narrative that reframes Nexus around three primary jobs: connect a repo, collect feedback, and review or promote work.

- [ui-simplification-spec.md](./ui-simplification-spec.md)
  - A concrete UI simplification spec for onboarding, widget launch, review, and advanced settings.

- [default-vs-advanced-gap-analysis.md](./default-vs-advanced-gap-analysis.md)
  - A surface-by-surface analysis of what belongs in the default path versus advanced/operator-only workflows.

## Intent

These docs do not propose a backend rewrite.

They assume the current backend and domain model remain largely intact while the product narrative and user-facing surfaces are simplified through:

1. A smaller default onboarding path
2. A clearer widget-first live-product use case
3. A more decision-oriented review queue
4. Progressive disclosure for advanced operator features

## Suggested Review Order

1. Read [prd-vnext-outline.md](./prd-vnext-outline.md) first to align on the product story.
2. Read [ui-simplification-spec.md](./ui-simplification-spec.md) second to see how that story maps into the UI.
3. Read [default-vs-advanced-gap-analysis.md](./default-vs-advanced-gap-analysis.md) last to decide what should move behind advanced controls.
