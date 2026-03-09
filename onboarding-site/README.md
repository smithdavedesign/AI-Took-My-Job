# Nexus Onboarding Site

This folder is a standalone static site intended to be deployed as its own Vercel project.

Current live deployment:

- `https://onboarding-site-eight.vercel.app`

## Deploy on Vercel

1. Import this repository into Vercel.
2. Set the project root directory to `onboarding-site`.
3. Keep the framework preset as `Other`.
4. Leave the build command empty.
5. Leave the output directory empty.
6. Deploy.

Because this is a plain static site, Vercel will serve `index.html` directly.

## Local preview

From this folder, any static file server works. For example:

```bash
npx serve .
```

## Content scope

The site is intentionally focused on operator onboarding:

- what Nexus is
- first-day setup
- daily review workflow
- promotion and GitHub hygiene
- common operator questions