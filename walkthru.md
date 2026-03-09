# GitHub App Setup Walkthrough

This walkthrough covers two things:

1. how to get the GitHub App values used by Nexus
2. how to get a public URL that GitHub can call back into during local development

## Short Answer On The URL

You do not need a Vercel domain just to validate the GitHub App onboarding flow.

What you need is a public HTTPS URL that forwards to your local Nexus gateway on port `4000` so GitHub can reach:

- `GET /github/app/install/callback`

For local development, the fastest options are:

1. `ngrok http 4000`
2. `cloudflared tunnel --url http://localhost:4000`

Use a Vercel domain only if you are actually deploying Nexus somewhere public. A domain by itself does not solve the problem. GitHub needs a reachable app, not just a DNS name.

## Recommendation

For local validation, use this path:

1. run Nexus locally
2. expose port `4000` with `ngrok` or `cloudflared`
3. use that tunnel URL as `APP_BASE_URL`
4. register the GitHub App against that URL
5. run the install-link flow

That is lower friction than setting up Vercel, and it matches how the current Fastify gateway is already running.

## Values You Need

In `.env`, the key fields for GitHub App onboarding are:

```env
APP_BASE_URL=
GITHUB_AUTH_MODE=app
GITHUB_DRAFT_SYNC_ENABLED=true

GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_SLUG=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_STATE_SECRET=

PUBLIC_WIDGET_SIGNING_SECRET=
PUBLIC_WIDGET_SESSION_TTL_SECONDS=900
```

What they mean:

- `APP_BASE_URL`: public base URL for your gateway
- `GITHUB_APP_ID`: numeric app id from GitHub
- `GITHUB_APP_PRIVATE_KEY`: PEM private key content from GitHub, newline-escaped
- `GITHUB_APP_SLUG`: GitHub App slug
- `GITHUB_APP_INSTALLATION_ID`: optional fallback installation id
- `GITHUB_APP_STATE_SECRET`: local secret used to sign install state
- `PUBLIC_WIDGET_SIGNING_SECRET`: local secret used to sign widget sessions

## Step 1: Start With A Public URL

### Option A: ngrok

Install it on macOS if needed:

```bash
brew install ngrok/ngrok/ngrok
```

Run a tunnel:

```bash
ngrok http 4000
```

You will get an HTTPS URL like:

```text
https://abc123.ngrok-free.app
```

Set:

```env
APP_BASE_URL=https://abc123.ngrok-free.app
```

### Option B: Cloudflare Tunnel

Install if needed:

```bash
brew install cloudflared
```

Run a quick tunnel:

```bash
cloudflared tunnel --url http://localhost:4000
```

You will get an HTTPS URL like:

```text
https://random-name.trycloudflare.com
```

Set:

```env
APP_BASE_URL=https://random-name.trycloudflare.com
```

### Should You Use Vercel?

Only if one of these is true:

1. you want a persistent public environment for Nexus
2. you are willing to deploy the gateway itself somewhere public
3. you want a stable branded URL for repeat demos

For local iteration, Vercel is usually the wrong first step here. Nexus is already running locally as a gateway service, so tunneling is the simplest route.

## Step 2: Create The GitHub App

Open GitHub:

1. go to `Settings`
2. open `Developer settings`
3. open `GitHub Apps`
4. click `New GitHub App`

Suggested values:

- App name: `nexus-local-dev-<something-unique>`
- Homepage URL: your `APP_BASE_URL`
- Setup URL: `https://your-public-url/github/app/install/callback`
- Webhook URL: optional for this flow if you are not validating webhook delivery yet

The critical field is the setup URL:

```text
<APP_BASE_URL>/github/app/install/callback
```

Example:

```text
https://abc123.ngrok-free.app/github/app/install/callback
```

## Step 3: Set App Permissions

For the flows currently implemented, start with:

- Repository permissions:
  - `Metadata`: Read-only
  - `Issues`: Read and write
  - `Pull requests`: Read and write
  - `Contents`: Read and write

If you want to keep this tighter, you can start smaller and expand only if the app hits permission errors.

## Step 4: Get The GitHub-Issued Values

After creating the app, GitHub gives you these values.

### `GITHUB_APP_ID`

Copy the numeric `App ID` from the app settings page.

Example:

```env
GITHUB_APP_ID=1234567
```

### `GITHUB_APP_SLUG`

Copy the slug from the app URL.

If the app page is:

```text
https://github.com/apps/nexus-local-dev-demo
```

then:

```env
GITHUB_APP_SLUG=nexus-local-dev-demo
```

### `GITHUB_APP_PRIVATE_KEY`

In the app settings page:

1. open `Private keys`
2. click `Generate a private key`
3. GitHub downloads a `.pem` file

Convert it to a single escaped line for `.env`:

```bash
perl -0pe 's/\n/\\n/g' ~/Downloads/your-app.private-key.pem
```

Paste the output into:

```env
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n
```

## Step 5: Generate Your Local Secrets

These do not come from GitHub.

Generate them locally:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use one for:

```env
GITHUB_APP_STATE_SECRET=
```

Use the other for:

```env
PUBLIC_WIDGET_SIGNING_SECRET=
```

## Step 6: Install The App

Once the app exists, install it onto the repository or org you want to use.

You can do this either from GitHub directly or through Nexus's install-link route after config is in place.

If you install it manually first, GitHub will redirect through your setup URL and include an `installation_id`.

That can be used as:

```env
GITHUB_APP_INSTALLATION_ID=12345678
```

This value is optional for the new project-scoped onboarding flow, but still useful as a global fallback.

## Step 7: Update `.env`

A realistic local config block looks like this:

```env
APP_BASE_URL=https://abc123.ngrok-free.app

GITHUB_AUTH_MODE=app
GITHUB_DRAFT_SYNC_ENABLED=true

GITHUB_APP_ID=1234567
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n
GITHUB_APP_SLUG=nexus-local-dev-demo
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_APP_STATE_SECRET=replace-with-random-secret

PUBLIC_WIDGET_SIGNING_SECRET=replace-with-another-random-secret
PUBLIC_WIDGET_SESSION_TTL_SECONDS=900
```

## Step 8: Restart The App

This repo already loads `.env` in the app config path, so the normal commands are enough:

```bash
npm run dev
npm run worker
```

Avoid relying on `set -a && source .env` with this repo because JSON-like env values can be awkward in shell parsing.

## Step 9: Validate The Flow

Once those values are present:

1. create a workspace
2. call `POST /internal/workspaces/:workspaceId/github-app/install-link`
3. open the returned `installUrl`
4. install the app in GitHub
5. let GitHub redirect back to `/github/app/install/callback`
6. confirm the callback page reports success

## Practical URL Guidance

### Use `ngrok` if:

1. you want the fastest path today
2. you are okay with a temporary URL
3. you are just validating the callback flow

### Use `cloudflared` if:

1. you want a free HTTPS tunnel
2. you do not need Vercel or a hosted deployment yet
3. you are comfortable with Cloudflare's tooling

### Use Vercel or a custom domain if:

1. you plan to keep a stable demo environment up
2. Nexus will actually be deployed behind that URL
3. you want a persistent setup URL for other users

## My Recommendation

Do not start with a Vercel domain for this specific task.

Start with:

1. `ngrok http 4000`
2. set `APP_BASE_URL`
3. create the GitHub App
4. fill in the app id, slug, and private key
5. restart `npm run dev` and `npm run worker`

That gets you to a working callback validation path with the fewest moving parts.