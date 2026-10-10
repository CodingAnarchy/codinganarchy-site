---
name: Hammerwork
tagline: A database-driven job queue for Rust, backed by PostgreSQL or MySQL.
language: Rust
status: stable
repo: https://github.com/CodingAnarchy/hammerwork
links:
  - label: crates.io
    url: https://crates.io/crates/hammerwork
  - label: docs.rs
    url: https://docs.rs/hammerwork
order: 10
---

Hammerwork runs background jobs out of the database you already have. Jobs live in PostgreSQL or MySQL tables, so enqueueing can share a transaction with the write that caused it, and there is no separate broker to run.

On top of that core it covers what production queues end up needing:

- **Scheduling**: five priority levels, cron expressions with time zones, rate limiting, and per-job timeouts.
- **Retries**: exponential, linear, and Fibonacci backoff with jitter, plus dead-job management.
- **Workflows**: job dependencies, sequential chains, parallel fan-out with barriers, and jobs that spawn child jobs at runtime.
- **Payload security**: AES-256-GCM or ChaCha20-Poly1305 encryption, field-level PII protection, and key rotation with external KMS support.
- **Operations**: worker autoscaling, batch claims, archiving and retention policies, Prometheus metrics, OpenTelemetry tracing, and a web dashboard.
- **Testing**: an in-memory `TestQueue` with a mock clock for deterministic tests of time-dependent behaviour.

```toml
[dependencies]
hammerwork = { version = "2.1", features = ["postgres"] }
```
