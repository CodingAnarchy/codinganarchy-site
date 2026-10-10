# codinganarchy-site

Projects and writing from [CodingAnarchy](https://github.com/CodingAnarchy), built with [Astro](https://astro.build) and served by Cloudflare Pages.

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

Cloudflare Pages builds from `main`. To connect it: Workers & Pages → Create → Pages → Connect to Git → `CodingAnarchy/codinganarchy-site`, with

- Framework preset: Astro
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION=22`

Every push to `main` deploys; pull requests get preview URLs.

### Custom domain

After attaching a domain under the Pages project's Custom domains tab, update `site` in `astro.config.mjs` and the `Sitemap:` line in `public/robots.txt`. RSS, canonical links, and the sitemap all derive from those.
