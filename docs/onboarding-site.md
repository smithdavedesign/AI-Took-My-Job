# Operator Onboarding Site

The repository includes a standalone static onboarding site in `onboarding-site/`.

This site is not part of the Fastify runtime. It exists so Nexus can have a lightweight onboarding and rollout surface that is easy to publish on Vercel and easy to iterate on alongside the product docs.

## Why It Exists

The runtime already exposes operator-facing product pages under `/learn`, but those pages still assume access to a running Nexus environment.

The static onboarding site serves a different need:

- product onboarding before a runtime exists
- operator training for rollout and demos
- a lightweight public docs surface for Vercel hosting
- a versioned handoff page that lives with the repo

## What The Site Covers

The current site focuses on operator onboarding:

- product overview and positioning
- first-day setup sequence
- daily operating workflow
- promotion and review guardrails
- common onboarding questions

## Folder Layout

- `onboarding-site/index.html`
- `onboarding-site/styles.css`
- `onboarding-site/main.js`
- `onboarding-site/vercel.json`
- `onboarding-site/README.md`

## Vercel Deployment

Deploy it as its own Vercel project.

Current live deployment:

- `https://onboarding-site-eight.vercel.app`

Recommended settings:

1. Import the repository into Vercel.
2. Set the root directory to `onboarding-site`.
3. Use the `Other` framework preset.
4. Leave the build command empty.
5. Leave the output directory empty.

Because the site is plain static HTML, CSS, and JavaScript, Vercel can serve it directly without a build step.

## Maintenance Guidance

Keep the site aligned with the real Nexus workflow.

When the product changes, update the onboarding site if any of these change:

- operator console entry points
- GitHub auth guidance
- review queue behavior
- agent promotion and merge rules
- customer-facing intake and dashboard flows

The goal is to keep onboarding guidance versioned with the product instead of treating it as a stale marketing artifact.