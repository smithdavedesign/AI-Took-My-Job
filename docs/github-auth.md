# GitHub Auth Modes

Nexus currently supports two GitHub authentication modes.

## PAT Mode

Use `GITHUB_AUTH_MODE=pat` with a token in `GITHUB_TOKEN`.

Recommended setup:

- Create a dedicated service account in GitHub.
- Generate a PAT with the smallest repo-scoped permissions needed for issue creation.
- Limit repository access to the target repo or a narrow set of repos.

Why use it:

- Lowest setup friction.
- Good for local development and early pilots.
- Easy to explain to internal users.

Tradeoffs:

- Token privileges are tied to the service account identity.
- Rotation and auditing are weaker than a GitHub App.
- Fine-grained org controls are more limited.

## GitHub App Mode

Use `GITHUB_AUTH_MODE=app` with:

- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`

Why use it:

- Better repo and org scoping.
- Better auditability.
- Cleaner long-term enterprise model.

Tradeoffs:

- More setup complexity.
- Requires app registration and installation before first use.

## Recommendation

Use PAT mode for initial development and internal demos. Keep GitHub App mode available for productionization and customer-facing self-hosted deployments.

## Test Endpoint

The gateway exposes a protected route for draft issue creation:

- `POST /internal/github/issues/draft`

Headers:

- `content-type: application/json`
- `x-nexus-shared-secret: <WEBHOOK_SHARED_SECRET>`

Body:

```json
{
  "title": "Checkout button stalls",
  "body": "Observed in staging after applying a discount code.",
  "labels": ["bug", "staging"]
}
```