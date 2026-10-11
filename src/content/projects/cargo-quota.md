---
name: cargo-quota
tagline: Keeps cargo's target directory under a disk budget by pruning least recently used artifacts before each build.
language: Rust
status: active
repo: https://github.com/CodingAnarchy/cargo-quota
links:
  - label: crates.io
    url: https://crates.io/crates/cargo-quota
package:
  registry: crates
  name: cargo-quota
order: 40
---

`cargo clean` throws everything away. A normal build keeps everything forever. `cargo-quota` sits in between: when a target directory goes over its budget, it removes artifacts oldest-first until it's back under, and it never touches anything you've used recently.

```console
$ cargo quota build --release
     Pruning /home/me/proj/target is 41.2 GiB, over its 37.3 GiB budget (2% of 1.8 TiB)
     Removed 812 artifacts (11.7 GiB) unused for 19d or longer, leaving 29.5 GiB
   Compiling proj v0.1.0 (/home/me/proj)
    Finished `release` profile [optimized] target(s) in 4.12s
```

- **Budget** is a percentage of disk space (5% by default), set per project in `Cargo.toml` or globally with an environment variable.
- **Pruning** works on whole compilation units, grouped by the hash cargo puts in every artifact name. Cargo rebuilds a removed unit only if it's needed again.
- **Safety**: anything used within the last hour is kept, and a profile directory with a build in progress is skipped by taking cargo's own lock.
- **Worktrees**: `--worktrees` puts every git worktree of a repository under one shared budget, so abandoned worktrees get pruned first.

Cargo has no pre-build hook, so a shell wrapper or cargo aliases route `build`, `test`, and friends through `cargo quota`. The README has both.

```sh
cargo install cargo-quota
```
