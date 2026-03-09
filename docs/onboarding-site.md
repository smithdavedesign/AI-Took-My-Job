# Operator Onboarding Site

The repository includes a standalone static onboarding site in `onboarding-site/`.

This site is not part of the Fastify runtime. It exists so Nexus can publish a lightweight operator journey on Vercel and keep the onboarding story versioned with the product.

## Why It Exists

The runtime already exposes operator-facing product pages under `/learn`, but those pages assume a working Nexus environment and service-token access.

The static site serves a different purpose:

- pre-runtime product onboarding
- rollout and demo training for operators
- a public handoff page that explains the workflow without exposing the app
- a versioned five-step narrative that stays aligned with the codebase

## Five-Step Narrative

The site now frames Nexus around a single operator story:

- Pilot: create the workspace, define the project, and decide the first adoption scope.
- Connect: attach GitHub access, installation state, and repository bindings.
- Launch: mint widget and portal surfaces, confirm public routes, and validate readiness.
- Operate: run the review queue and support surfaces as the daily decision layer.
- Promote: move only approved, validation-safe work into GitHub and durable customer access.

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

Update the onboarding site whenever any of these change:

- learn-surface entry points for onboarding, review, or support
- GitHub auth and installation guidance
- review-queue approval rules
- promotion and merge guardrails
- customer-facing widget, dashboard, or portal flows

The goal is to keep onboarding guidance versioned with the product instead of letting the public story drift from the runtime surfaces.
