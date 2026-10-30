---
name: Pigeonhole
tagline: An embedded, single-file, wide-column store. BigTable's data model with SQLite's deployment model.
language: Rust
status: stable
repo: https://github.com/CodingAnarchy/pigeonhole
links:
  - label: crates.io
    url: https://crates.io/crates/pigeonhole
  - label: docs.rs
    url: https://docs.rs/pigeonhole
package:
  registry: crates
  name: pigeonhole
order: 20
---

SQLite owns local OLTP and DuckDB owns local OLAP. Pigeonhole targets the missing quadrant: local data that is **sparse, versioned, and scanned by row**. Think feature stores, time series keyed by entity, crawl and event caches, graph adjacency, and per-user state.

`cargo add pigeonhole`, open a file, and you get rows of arbitrary sparse columns grouped into families, with versions, TTLs, and prefix and range scans. There is no server.

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
```

Memtables flush into the file and compact, so data is bounded by disk rather than memory, and commits are crash-safe through a write-ahead log. A clean close leaves a single file.

> Pigeonhole 1.0 is stable. The public API follows semver, and every 1.x release reads and writes file format 4. Known gaps are listed in [`docs/status.md`](https://github.com/CodingAnarchy/pigeonhole/blob/main/docs/status.md). Read the [1.0 announcement](/blog/pigeonhole-1/).
