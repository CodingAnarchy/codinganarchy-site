# codinganarchy-site

Projects and writing from [CodingAnarchy](https://github.com/CodingAnarchy), built with [Astro](https://astro.build) and served by Cloudflare Workers.

## Writing

**A post** is a Markdown file in `src/content/posts/`. The filename becomes the URL, so `src/content/posts/pigeonhole-0-3.md` is served at `/blog/pigeonhole-0-3/`.

```markdown
---
title: Pigeonhole 0.3
description: One sentence for the post list, RSS, and link previews.
date: 2026-11-01
tags: [release]
project: pigeonhole   # optional: lists the post on that project's page
draft: true           # optional: visible in `npm run dev`, left out of builds
---
```

**A project** is a Markdown file in `src/content/projects/`. Front matter holds `name`, `tagline`, `language`, `status` (`active`, `experimental`, `stable`, or `archived`), `repo`, optional `links`, and an `order` for sorting. The body is the project page.

The schemas live in `src/content.config.ts`, and a build fails if front matter doesn't match them.

## Local development

```sh
npm install
npm run dev       # http://localhost:4321, drafts included
npm run build     # static output in dist/
npm run preview   # serve dist/
```

Requires Node 22.12 or newer.

## Deploying

The site deploys as a static-assets Cloudflare Worker named `codinganarchy-site`. `wrangler.jsonc` points it at `dist/` and serves `404.html` for unknown paths; `public/_headers` sets response headers.

To connect it: Workers & Pages → Create → Import a repository → `CodingAnarchy/codinganarchy-site`, with

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Environment variable: `NODE_VERSION=22`

Every push to `main` deploys. To deploy by hand: `npm run build && npx wrangler deploy`.

### Custom domain

The site is served at [codinganarchy.dev](https://codinganarchy.dev), attached under the Worker's Settings → Domains & Routes. `site` in `astro.config.mjs` and the `Sitemap:` line in `public/robots.txt` must match it; RSS, canonical links, and the sitemap all derive from those. The `workers.dev` URL keeps working, and canonical links point search engines at the custom domain.
