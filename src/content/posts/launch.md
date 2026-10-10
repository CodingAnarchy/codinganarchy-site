---
title: codinganarchy.dev is live
description: A home for my open-source projects, plus release notes and write-ups.
date: 2026-10-10
tags: [meta]
---

I build things on the side, mostly the kind of infrastructure I end up wishing existed at work: job queues, storage engines, glue between languages. A few of them have grown past weekend experiments, and a README only goes so far at that point. It's a good place for install steps. It's a bad place to explain why a design went the way it did, or what a benchmark taught me.

This site is where that writing will go. If something here is useful to you, I'd like to hear about it. If something's wrong, open an issue.

## What's here

- [Hammerwork](/projects/hammerwork/): a job queue for Rust that stores its jobs in PostgreSQL or MySQL. Stable, 2.1.
- [Pigeonhole](/projects/pigeonhole/): an embedded wide-column store that keeps everything in one file. Experimental, 0.2.
- [tonic-rails](/projects/tonic-rails/): gRPC for Rails, with the HTTP/2 transport in Rust.

Each project page links to its source, crates, and docs, and lists any posts about it.

## What's coming

Release notes, design decisions, benchmarks, and the occasional post-mortem. Mostly Rust.

## Subscribe

[RSS](/rss.xml). No newsletter, no tracking.

## Stack

[Astro](https://astro.build) builds the Markdown into static HTML, and a Cloudflare Worker serves it. There's no client-side JavaScript. Source is at [CodingAnarchy/codinganarchy-site](https://github.com/CodingAnarchy/codinganarchy-site).
