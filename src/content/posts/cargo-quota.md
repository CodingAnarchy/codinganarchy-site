---
title: "cargo-quota: a disk budget for target/"
description: Coding agents rebuild Rust projects all day, and target/ never shrinks. cargo-quota prunes it to a budget before every build.
date: 2026-10-10
tags: [rust, cargo, release]
project: cargo-quota
draft: true
---

I kept running out of disk space on my laptop, and it was always the same cause: Rust target directories.

Agents are most of the reason. On any given day I have several of them working across my projects, each in its own git worktree, building, testing, running clippy, and switching feature flags. Every one of those builds leaves artifacts behind, and cargo never removes any of them on its own. Eventually a build fails with "No space left on device", and that's when I find out.

As I write this, the target directories under `~/projects` add up to 82.6 GiB. Hammerwork's alone is 26.9 GiB, and every artifact in it was used within the last 22 hours.

## Why target/ only grows

Cargo identifies every compilation unit (one crate, built one way, with one set of features and flags) by a hash, and names all of that unit's outputs with it. Change a feature, bump a dependency, or switch from `build` to `test` or `check`, and you get a new hash and a new set of files. The old ones stay.

That's the right default for build speed: if you switch back, nothing needs rebuilding. But nothing ever expires. Every worktree has its own `target/`, so five worktrees can hold five copies of the same dependency tree.

## What already exists

**`cargo clean`** is all or nothing. `-p` and `--profile` narrow it to one package or profile, but they can't tell what's stale from what you're about to use. You trade disk for a full rebuild, and you only remember to run it once the disk is already full.

**A shared `CARGO_TARGET_DIR`** cuts down on duplicate dependencies across projects. But cargo locks the build directory, so concurrent builds wait on each other ("Blocking waiting for file lock on build directory"). That's a bad trade with several agents building at once. It also still grows without limit.

**[cargo-sweep](https://github.com/holmgr/cargo-sweep)** is the closest thing to what I wanted. It can remove artifacts older than N days (`--time`), or remove the oldest ones until a target directory fits a fixed size (`--maxsize 10GB`). But it falls short in four ways:

- It's a command you run by hand or from cron, not something tied to the build.
- The size is absolute, so the right number depends on the machine.
- Each target directory is handled on its own, with no notion of worktrees, so a worktree you've abandoned keeps its full allowance.
- It doesn't take cargo's build lock, so a cron run can delete files out from under a build that's in progress.

Its README now says it's unmaintained, too.

**Cargo itself** has cleaned its global caches under `~/.cargo` automatically since [1.88](https://blog.rust-lang.org/2025/06/26/Rust-1.88.0/), removing cached files that haven't been used in one to three months. That covers the registry and git caches, not `target/`. Garbage collection for the target directory is [on the Cargo team's list](https://hackmd.io/@rust-cargo-team/SJT-p_rL2), but it needs last-use tracking that cargo doesn't have yet.

What I wanted was smaller than any of those: check before every build, prune if over budget, and never delete what's in use.

## How cargo-quota works

```sh
cargo quota build --release   # prune if needed, then cargo build --release
cargo quota status            # size, budget, and what a prune would remove
```

**The budget is a percentage of the disk**, 5% by default. That scales from a laptop to a build box without anyone working out numbers in GiB.

**Pruning is least recently used, by compilation unit.** cargo-quota groups files by the unit hash and removes whole units, so cargo never sees half an artifact. It just finds no fingerprint and rebuilds the unit if it's ever needed again. "Last used" is the newest access or modification time of any file in the unit. Cargo reads fingerprints on every build, even when there's nothing to do, so units you're still using stay fresh.

**It prunes past the budget, to a low-water mark** (80% of the budget by default), so the next few builds don't each trigger a small prune.

**It never removes anything used in the last hour**, even if that leaves the directory over budget. A budget that's too small shouldn't delete what the current build is about to read.

**It takes cargo's own lock** on each profile directory before removing anything. If a build holds the lock, that directory is skipped. With several agents building in parallel, this is the part that matters most.

**`--worktrees` shares one budget across a repository's worktrees.** Without it, a worktree you've stopped building in is never pruned, because pruning only happens on a build. With it, cargo-quota finds the other worktrees through `git worktree list` and prunes them as one pool, so abandoned worktrees go first.

Configuration goes in `Cargo.toml`, which cargo ignores:

```toml
[workspace.metadata.quota]
percent = 2
worktrees = true
```

## Making it automatic

Cargo has no pre-build hook, and it won't let an alias shadow `build`. A shell function that wraps `cargo` gets around both. The [README](https://github.com/CodingAnarchy/cargo-quota#running-it-automatically) has versions for fish, bash, and zsh.

Agents are the catch. They often run commands in a non-interactive shell that never loads your shell functions. My fish wrapper works in my terminal, but the agent on my laptop gets plain `cargo`. The fix is to tell the agent: a line in `AGENTS.md` or `CLAUDE.md` asking it to build with `cargo quota build` and `cargo quota test`.

When the directory is under budget, all cargo-quota does is measure its size. On a 19 GiB target directory with 190k files that takes about 0.9 seconds, close to `du -s`. If pruning fails for any reason, the build runs anyway.

## Limits

- The budget applies to one target directory, or one repository with `--worktrees`. Ten projects at 5% each can still take half the disk, so pick the percentage with that in mind.
- rust-analyzer and IDEs call cargo directly and skip the wrapper. The next build from a shell catches up.
- On `noatime` mounts, "last used" means "last rebuilt".
- A pruned unit costs a rebuild if you need it again. That's the trade: a slower build now and then, instead of a full disk.

## Try it

```sh
cargo install cargo-quota
cargo quota status
```

`status` doesn't change anything, so it's a safe first step. Source and issues are on [GitHub](https://github.com/CodingAnarchy/cargo-quota).
