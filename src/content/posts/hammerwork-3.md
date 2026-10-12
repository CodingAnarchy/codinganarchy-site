---
title: "Hammerwork 3.0, and the four days of hardening behind it"
description: Agents wrote most of Hammerwork in 2025, and its feature list got ahead of its code. With Opus 5.5, 2.0 through 3.0 made that list true.
date: 2026-10-11T20:40:27-04:00
tags: [rust, hammerwork, release]
project: hammerwork
draft: true
---

[Hammerwork](/projects/hammerwork/) 3.0.0 is out. It's a Rust job queue that keeps its jobs in PostgreSQL or MySQL, and by 1.15 it had a long feature list: workflows, cron, payload encryption, event streaming, webhooks, alerting, autoscaling, a dashboard, and a CLI.

Most of that was written by coding agents in 2025. That's how the list got so long so fast, and it's also why I wasn't sure how much of it to trust. The library compiled and the README described every feature, but the evidence underneath was thin. GitHub had disabled the integration test workflow for inactivity, and its last runs had all failed. Nine integration test files no longer compiled, 20 library tests failed, and the MySQL migrations didn't run on MySQL 8, so the MySQL backend couldn't even be set up.

The agents have changed a lot since then. With Opus 5.5, I came back to Hammerwork this month to make it actually work: run it against real databases with concurrent workers, and see what holds.

A lot didn't. 2.0 through 3.0 is the work of fixing that: 88 merged pull requests and 45 closed issues between October 8 and October 11.

## How the work was done

I ran it with a fleet of Opus 5.5 agents in [Herdr](https://github.com/ogulcancelik/herdr), a terminal workspace that keeps many agent sessions running side by side and shows which ones are working, blocked, or done. Herdr isn't what made the agents useful. It made it practical to run many of them at once and keep up with them.

The structure mattered more than the tooling:

- **Audits were read-only, and findings needed evidence.** An audit agent read the code and filed issues, and a finding counted as confirmed only if it had been reproduced against local PostgreSQL 16 and MySQL 8 databases, traced end to end, or shown by grep that nothing ever read a value.
- **Fixes landed as separate pull requests**, almost all of them tied to an audit issue.
- **Reviews were adversarial.** After the fixes landed, a final review went looking for what the fixes themselves had broken.

That last step earned its keep. The first round added job leases and a reaper to recover jobs stuck in `Running`. The final review found that the reaper could reclaim jobs that were still running, so they executed twice. A fix for one critical bug had created another, and it was caught before release.

## What the audit found

The worst bugs were in the core lifecycle:

- **Jobs ran more than once.** The PostgreSQL weighted-priority dequeue took its `FOR UPDATE SKIP LOCKED` locks outside a transaction, so they were released before the claiming `UPDATE`, which didn't check the job's status. With 16 workers and 200 jobs, 76 jobs ran more than once.
- **Jobs stuck in `Running` forever.** Nothing ever reclaimed a job whose worker crashed or was killed.
- **Workflow dependencies never resolved.** Nothing called the resolution code, so dependent jobs waited forever and failure policies never applied.
- **Retries ignored the job's own limit.** A job with `max_attempts = 5` stopped after 3 runs, and `max_attempts = 1` still ran 3 times.
- **Finished jobs could come back.** Status updates had no guard on the current status, so a `Dead` job could be put back to `Pending` and a late worker could overwrite a job the reaper had already reclaimed.

Then there was the category that says the most about how 1.x was built: features that reported success without doing anything. Each one looked finished from the outside, and some updated their statistics as if they had worked.

- **Event streams never sent anything.** The stream manager prepared each batch, hit a `// For now, simulate successful processing` comment, and recorded it as delivered. Kafka, Kinesis, and Pub/Sub dropped every event while their stats said everything was fine.
- **"Encrypted" payloads were stored in plaintext.** `Job::with_encryption` was saved on the job and ignored.
- **Email alerts logged the alert and returned `Ok`.**
- **Autoscaling never added or removed a worker.** It updated a metric.
- **Webhooks dropped events.** Each listener re-subscribed on every loop iteration, so events published while it was busy were skipped. In a burst of 100 events, a stream processor received 1.

And a few security problems: SQL injection through queue names in the CLI, several dashboard authentication flaws, and AWS and GCP KMS key sources that generated a new key on every start, so nothing encrypted before a restart could be decrypted after it.

## 2.0: making it true

[2.0.0](https://github.com/CodingAnarchy/hammerwork/blob/master/CHANGELOG.md) fixed all of that. The changes that matter most:

- **Leases, heartbeats, and a reaper.** A running job holds a lease that its worker renews. When the lease expires, the reaper reclaims the job. A job that keeps heartbeating is never touched.
- **A job lifecycle state machine.** Every transition checks the current status in the same statement that changes it, so a finished job stays finished.
- **Claims are atomic on both backends.** Lock and claim happen in one transaction. MySQL now uses `SKIP LOCKED` too, runs claims at `READ COMMITTED`, and retries when InnoDB picks it as a deadlock victim.
- **Encryption that encrypts.** Payloads are encrypted at rest, integrity hashes are keyed HMACs, KMS keys use envelope encryption and survive restarts, and an external key source that can't load fails instead of falling back to a derived key.
- **Delivery that does what it reports.** Streams send, with retries and real per-event statistics. Email goes out over SMTP.
- **Migrations you can re-run.** MySQL DDL commits on its own, so a migration that failed halfway used to leave the schema half-applied and fail on every retry. Every MySQL migration now checks `information_schema` first, and a test replays every migration over a finished schema on both backends.

## 2.1 through 2.5: parity and bug hunts

The next releases added batch claims, automatic cleanup of expired results, and key rotation from configuration. Most of the work, though, was three more bug hunts, aimed at places where the backends disagreed:

- PostgreSQL, MySQL, and the in-memory `TestQueue` now behave the same, so tests against `TestQueue` mean something.
- MySQL archiving had wedged for good on any job with a retry strategy: the archive column was `VARCHAR(50)`, too short for nearly every serialized strategy. Strict MySQL rejected the insert, and because candidates are taken oldest first, every later pass failed on the same jobs.
- Workflows now count archived and spawned jobs, so a workflow can't finish early or stay running forever.
- Archiving measures job age on the database clock, so clock skew on an app server can't archive jobs early.

## 3.0: an API that can keep its promises

3.0 is the breaking release, and every break is there to stop a class of mistake from coming back:

- **No default features.** `default` used to pull `warp`, `reqwest`, `lettre`, and `prometheus` into every build. Now you name what you use, or take `full`.
- **One way to claim jobs.** `dequeue(&DequeueOptions)` replaces five claim methods. Five methods were five chances to get claiming wrong, and the duplicate-execution bug lived in just one of them.
- **Sealed traits.** `DatabaseQueue` and `MigrationRunner` can't be implemented outside the crate, so the fallback default methods that existed only for outside implementations are gone.
- **`#[non_exhaustive]` with builders.** Configuration, statistics, and growing enums can gain fields and variants without another major version.
- **Invalid settings are rejected.** A rate limit of zero never refilled, so a worker using one waited forever. Now it's a configuration error.
- **MySQL past 2038.** Times are stored as `DATETIME(6)`, so jobs can be scheduled up to year 9999.
- **The reaper relies on leases alone**, now that every claim writes one.

It also moves to sqlx 0.9, which is part of Hammerwork's public API, so your own sqlx has to move too. The minimum Rust version is now 1.94.

## Upgrading

Read [Upgrading from 2.x to 3.0](https://github.com/CodingAnarchy/hammerwork/blob/master/docs/upgrading-to-3.0.md) first. It starts with the order to do things in. The short version:

1. Stop every 1.x worker. 3.0 never reclaims a running job without a lease, and 1.x claimed jobs without one.
2. Move to Rust 1.94 and sqlx 0.9, and list the features you use.
3. Run migrations off-peak. On MySQL, migration 021 rewrites every table and blocks writes while it does.
4. Run `cargo hammerwork maintenance check --fix` for any jobs 1.x left behind.

```toml
[dependencies]
hammerwork = { version = "3", features = ["postgres", "full"] }
```

## Bug reports welcome

Four days of audits against real databases found a lot, and I'd bet they didn't find everything. If you run Hammerwork and something looks wrong, especially anything that reports success, [open an issue](https://github.com/CodingAnarchy/hammerwork/issues).
