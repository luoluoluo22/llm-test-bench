# Deploying your own copy

This project is a plain static site: HTML, CSS, and native ES modules with no
build step and no server. Any static host will serve it, and the whole repository
is the deploy artefact.

## Run it locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome or Edge. Do not open the files with a
`file://` URL — ES modules and folder access need an HTTP(S) origin.

## Deploy to a static host

Fork or clone the repository, then point your host at it with:

- **Build command:** none (`exit 0` if a command is required)
- **Build output directory:** `.` (the repository root)
- **Framework preset:** none

That is the whole configuration. Cloudflare Pages, Netlify, GitHub Pages, and
Vercel all work; the notes below use Cloudflare Pages because `_headers` is
written in its format.

### Cloudflare Pages

1. In the Cloudflare dashboard, open **Workers & Pages**.
2. Choose **Create application → Pages → Connect to Git** and select your fork.
3. Set the production branch, use no framework preset, set the build command to
   `exit 0`, and set the output directory to `.`.
4. Save and deploy.

You get a `*.pages.dev` address immediately. Test it before attaching a custom
domain; to add one, use the Pages project's **Custom domains** screen rather than
creating a DNS record by hand, or you may see a `522` error.

- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/configuration/custom-domains/

### Optional: the showcase service

`functions/` holds a small read-only API for the showcase (`/api/showcase`,
`/api/showcase/<id>`, `/api/media/<key>`), backed by a D1 database and an R2
bucket. It is optional: with no bindings each route answers `503` and the site
serves the showcase copy baked into `_showcase/`. To turn it on, create a D1
database and an R2 bucket, apply `migrations/*.sql` to the database, and in the
Pages project's **Settings → Bindings** bind the database as `DB` and the bucket
as `MEDIA`. The maintainers fill it with their own seeding tool; a fork that
does not need a live showcase can ignore it.

### Public text evaluation shares

The fork adds a public text bench at `/text-bench/` and a community results page
at `/shares.html`. Model requests run directly from each visitor's browser to
their chosen OpenAI-compatible endpoint. API keys are kept in the browser's
session storage and are never included in share submissions. Public submissions
use the same D1 binding (`DB`); apply `migrations/0002_public_shares.sql` after
`0001_showcase.sql`. No R2 bucket is needed for text-only shares.

The share API requires same-origin POSTs, limits each client address to five
submissions per hour, caps request size, strips common credential patterns, and
stores only an address hash for rate limiting. Set a random `SHARE_RATE_SALT`
secret in **Pages → Settings → Variables and Secrets** to make those hashes
harder to correlate. Public shares are visible to anyone with the site URL; the
sharing action is explicit and displays a confirmation before submission.

### Other hosts

`_headers` is Cloudflare-specific. On Netlify the same file format works; on other
hosts, port the equivalent rules — `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options`, long-lived immutable caching for
`/shared/lib/*`, and the sandboxing `Content-Security-Policy` on `/_showcase/*` —
to your host's own configuration. `functions/` only runs on Cloudflare Pages;
elsewhere the site uses the baked-in `_showcase/` copy.

## Requirements

Serve over HTTPS (or `localhost`). The File System Access API, local-network
access to a model server, and screen recording are all secure-context features
and will not work over plain HTTP on a remote origin.

No provider API keys or model-service secrets are needed for deployment. Each user
enters their own key in their browser session; it is never part of the deployment.
For public shares, the optional SHARE_RATE_SALT secret is recommended.

## Check the deployment

- The landing page, settings page, privacy page, and every app listed in `PUBLIC_BUILD.json` loads.
- The site still works with the network offline after first load — every runtime
  dependency is vendored under `shared/lib/`, so nothing should be fetched from a
  CDN.
- The header navigation is reachable on a narrow phone-width viewport.
- Connecting a folder, generating, saving, reloading, and comparing all work in
  Chrome or Edge.
- No API key appears anywhere in the repository or your host's settings.
