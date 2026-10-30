---
title: "Pigeonhole 1.0: a wide-column store you can cargo add"
description: Pigeonhole 1.0 is out. It's an embedded, single-file wide-column store in Rust, built by a fleet of agents between October 5 and October 30.
date: 2026-10-30T12:19:48-04:00
tags: [rust, pigeonhole, release, databases]
project: pigeonhole
draft: false
---

[Pigeonhole](/projects/pigeonhole/) 1.0.0 is out. It's an embedded, single-file, wide-column store in Rust: BigTable's data model with SQLite's deployment model.

```sh
cargo add pigeonhole
```

The design doc is dated October 5, and 1.0 shipped on October 30.

## The missing quadrant

SQLite owns local OLTP and DuckDB owns local OLAP. Nothing covers local data that's **sparse, versioned, and read by row scans**: feature stores, time series keyed by entity, crawl and event caches, graph adjacency, per-user state.

For that kind of data today, the usual options are:

- **A raw key-value engine** like RocksDB, LMDB, redb, or fjall. It's fast, but you end up writing your own row, family, qualifier, and timestamp key encoding, plus versioning, TTLs, and per-family tuning.
- **SQLite with an EAV table or a JSON column.** It works, but sparse attributes bloat B-tree pages, a scan of one group of columns reads the whole row, and cells have no versions.
- **A server** like Cassandra, HBase, or Bigtable. You get real wide-column semantics, along with a process, a network hop, and an ops burden for data that lives on one machine.

Pigeonhole is the wide-column model as a library. You open a file and get rows of sparse columns grouped into families, with versions, TTLs, and prefix and range scans:

```rust
use pigeonhole::{Pigeonhole, Options, Family};

let db = Pigeonhole::open("crawl.phdb", Options::default())?;
let pages = db.table("pages")?
    .family("meta", Family::default().max_versions(1))
    .family("links", Family::default().bloom_bits(10))
    .create_if_missing()?;

pages.mutate(b"com.example/a")
    .put("meta", b"status", b"200")
    .put("links", b"com.example/b", b"")
    .commit()?;

for row in pages.scan(b"com.example/"..b"com.example0").family("links").iter()? {
    let row = row?;
    // ...
}
```

Each family is its own LSM tree with its own compression, bloom filters, version limit, TTL, and blob threshold, so a scan of `links` never touches the bytes in `meta`, and absent cells take no space. Commits are crash-safe through a write-ahead log, data is bounded by the disk rather than memory, and a clean close leaves one file.

## How it was built

Pigeonhole was built by a fleet of coding agents, mostly Opus 5.5, running in [Herdr](https://github.com/ogulcancelik/herdr): 800 commits and 790 merged pull requests. One Opus 5.5 agent was the coordinator. It ran a goal loop for each phase, handing work to the other agents, keeping the status doc and decision log current, and running the phase up to its gate. It made smaller decisions itself and handed bigger ones back to me, such as whether to accept a gap at a gate.

The spec set targets before there was any code: a point get under 2 µs at p50 and 10 µs at p99 in memory, over a million durable cells a second, and under 5 ms from open to first read. It also laid out a build order. One agent bootstrapped the workspace and CI, and one froze every crate's public interface and wrote `FORMAT.md`, which specifies every byte on disk and in shared memory. I approved those interfaces, and then agents built the components in parallel.

Each agent owned one crate per task and edited only that crate and its tests. Changing a frozen interface took a written change request naming every caller, approved before any code changed; 87 of those exist now. When the spec was silent or contradicted itself, an agent had to stop and file a question rather than pick an answer. Those questions became 293 numbered decisions, made by the coordinator or by me depending on their scale, and the decision log wins over the spec wherever they disagree.

Each phase ended at a gate:

1. **Core engine:** the fault-injection suite green across 300 seeds. Passed October 8, released as 0.1.0.
2. **Wide-column model:** beat hand-keyed RocksDB and SQLite EAV on a sparse-wide-row benchmark. Released as 0.2.0 on October 9.
3. **Latency engine:** the spec's latency targets met, and within 1.5× of RocksDB on every workload. Released as 0.3.0 on October 20, after nine runs on the reference machine across ten days.
4. **Hardening:** the file format frozen and the public API locked. Released as 1.0.0 on October 30.

From Phase 3 on, the performance gates ran on one reference machine: a Hetzner AX102 with 16 cores and NVMe, running Linux. Numbers from my Mac or CI runners were reported but didn't count toward a gate.

For testing, a deterministic simulator runs the engine over simulated I/O, injects faults, crashes it, and checks what survives against a reference model, and every failure prints a seed that replays it. A kill loop SIGKILLs a real writer process at random points, sometimes in the middle of recovery, and checks that every acknowledged commit survived and nothing else appeared. The crates with `unsafe` run under Miri, and the concurrent code has loom models. The agent guide also requires tests to call the code production runs, with no test-only paths in `src/`.

## Numbers

These are from the 1.0 release gate on the reference machine: 1 million rows, about 1 GB, with 16 clients. Each store got the same memory. Throughput comes first, then p99 latency:

| Workload | Durability | Pigeonhole | RocksDB | SQLite |
|---|---|--:|--:|--:|
| Reads (YCSB C) | GroupSync | 2.46M/s, 25 µs | 1.42M/s, 23 µs | 212K/s, 177 µs |
| 50% updates (YCSB A) | GroupSync | 486K/s, 98 µs | 193K/s, 214 µs | 39K/s, 82 µs |
| Scans (YCSB E) | GroupSync | 199K/s, 202 µs | 106K/s, 383 µs | 43K/s, 3.4 ms |
| Sparse wide rows | GroupSync | 84K/s, 2.6 ms | 59K/s, 3.5 ms | 34K/s, 8.3 ms |

`GroupSync` is the default: a commit returns once it's fsynced, and concurrent commits share the fsync. With one client, a row read takes 0.94 µs at p50. The [full tables and method](https://github.com/CodingAnarchy/pigeonhole/blob/main/docs/bench.md) cover the `Buffered` and `Sync` levels too.

## What 1.0 promises

- **Semver** for `pigeonhole`, `pigeonhole-arrow`, and the `phdb` command line. A check against committed API snapshots enforces it. The internal crates make no promises, and `pigeonhole` pins them exactly, so depend on `pigeonhole` only.
- **File format 4** for every 1.x release. Every 1.x build opens every file written by 0.1.0 or later, and the format has room to grow through feature bits and skippable manifest records without another version bump. [`FORMAT.md` §13](https://github.com/CodingAnarchy/pigeonhole/blob/main/FORMAT.md#13-compatibility-promise) is the written promise.
- **MSRV:** Rust 1.96. A minor release may raise it, and a patch release never will.

## What's new since 0.3

- **`phdb`**, a command-line tool (`cargo install pigeonhole-cli`) with `info`, `check`, `dump` and `load`, `backup`, `compact`, and a small shell. It works alongside a running writer by attaching as a reader process.
- **Arrow export** in `pigeonhole-arrow`, streaming a scan out as `RecordBatch`es, plus `phdb dump --format arrow`.
- **`transact`**, which runs and commits a transaction and retries conflicts with backoff. Conflicts are now tracked per cell, so fewer transactions fail.
- **Automatic recovery in place.** With `auto_recover` on, an I/O failure reopens the engine behind your existing handles, and operations caught in the pause get `Busy` instead of an error.
- **Reader processes get their own row cache**, so hot rows cost about the same to read in another process as in the writer.
- **Shard threads sized by load**, gathering a light load onto fewer threads and spreading it back out when traffic picks up.

## What it doesn't do yet

1.0 ships with known gaps, and [`docs/status.md`](https://github.com/CodingAnarchy/pigeonhole/blob/main/docs/status.md) lists them all. The ones you're most likely to hit:

- **Sparse-wide put p99** is 41 µs, 2.4× RocksDB's, on the default `CpuProfile::Embedded`. `CpuProfile::Server` gets it to about 1.6×. The fix, in the commit path's cross-thread hand-off, is planned after 1.0.
- **Contended multi-row transfers at `Buffered`**, and **reads running beside heavy writes**, are slower than I want. Both are accepted gaps with follow-up issues.
- **No C ABI yet**, so no Python, Ruby, or Go bindings. The spec plans them as thin wrappers over the Rust crate, after 1.0.
- **No SQL, replication, or multi-process writers.** These are out of scope by design. Pigeonhole has one writer process and any number of reader processes, like LMDB and DuckDB.

## Upgrading from 0.x

**Back up first.** The first writable open under 1.0 upgrades a 0.x file to format 4 in place, and after that 0.x refuses to open it. Take a `backup` or copy the closed file before you upgrade. Upgrade reader processes along with the writer, because the shared-memory layout changed. The [changelog](https://github.com/CodingAnarchy/pigeonhole/blob/main/CHANGELOG.md) has the API changes made before the freeze; most are `#[non_exhaustive]` enums that need a `_` arm.

## Bug reports welcome

If you try Pigeonhole on your own data, [open an issue](https://github.com/CodingAnarchy/pigeonhole/issues) for bugs, rough edges, and workloads where it's slower than it should be.
