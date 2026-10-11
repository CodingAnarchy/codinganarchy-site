---
title: "tonic-rails: gRPC for Rails, with the hard parts in Rust"
description: Serving gRPC from Rails has never had a great answer. Rust's tonic already solved the transport, so tonic-rails borrows it and keeps your handlers in Ruby.
date: 2026-10-10T21:08:01-04:00
tags: [ruby, rails, rust, grpc, release]
project: tonic-rails
---

If you've tried to serve gRPC from a Rails app, you've probably ended up in one of two places.

The first is the official `grpc` gem, which wraps gRPC's C core, either directly or through a framework built on it. It works, but it was never something I'd trust under load. It needs a Ruby thread for every call in flight, and once they're all busy it rejects new calls with `RESOURCE_EXHAUSTED` instead of queueing them. A streaming call holds its thread for the whole stream. In my benchmarks it turned away some streaming calls even with 50 threads.

The second is giving up and writing a JSON endpoint in a controller. That's reliable, but it isn't gRPC.

Meanwhile, Rust has [tonic](https://github.com/hyperium/tonic): a gRPC stack that handles HTTP/2, TLS, flow control, keepalives, health checks, and reflection, and that people run in production. So the question I kept coming back to was: tonic already figured all of this out, so can Rails just use it?

## Puma for gRPC

That's what [tonic-rails](https://github.com/CodingAnarchy/tonic-rails) is. Think of Puma: it deals with sockets and HTTP so your controllers only ever see requests. tonic-rails does the same thing for gRPC. The transport runs in Rust, outside Ruby's GVL. Your handlers are plain Ruby classes that take protobuf messages and return them, inside the Rails executor, with your models, caches, and error reporting all available.

```ruby
class ItemService
  include Tonic::Rails::Base
  rpc_service "demo.v1.ItemService"
  request_format :message

  def get_item(request)
    item = Item.find_by(id: request.id)
    raise Tonic::Rails::RpcError.new("item not found", code: :not_found) unless item

    Demo::V1::Item.new(id: item.id, name: item.name)
  end
end
```

Register it in an initializer, run `bin/rails tonic_rails:serve`, and it's listening on port 50051. In production it runs as its own process, next to your web server.

## How it works

```
 client ──HTTP/2──▶ tonic (Rust, no GVL)
                     ├─ TLS, flow control, keepalive, limits
                     ├─ grpc.health.v1, grpc.reflection.v1
                     └─ everything else ─▶ queue ─▶ Ruby dispatch thread
                                                   (takes the GVL)
                                                   decode → handler → encode
```

The split is the whole idea, and a few details make it pay off:

- **Rust never decodes your messages.** It hands raw protobuf bytes to Ruby, and the `google-protobuf` C extension decodes them once. Nothing about your services is compiled into the extension; routes come from the handlers you register.
- **Calls queue instead of bouncing.** Handlers run on a pool of dispatch threads. When they're busy, calls wait in a bounded queue. Only when that's full do new calls fail fast with `RESOURCE_EXHAUSTED`, which is load shedding you chose rather than a side effect of thread count.
- **Blocking I/O releases the GVL**, so dispatch threads overlap database and HTTP calls the way Puma threads do.
- **The GVL gets batched.** A dispatch thread that already holds the GVL keeps working through queued requests, up to 16 of them or 500 µs, instead of releasing and re-acquiring it for each. That alone raised throughput on light calls by 40–60%.
- **Health checks never touch Ruby.** `grpc.health.v1` is answered in Rust, and it flips to `NOT_SERVING` as soon as shutdown begins.

All four RPC kinds work (unary, server streaming, client streaming, and bidirectional), with backpressure in both directions. A server-streaming handler returns any Enumerable, and if the client reads slowly, the handler waits without holding the GVL instead of buffering everything in memory.

## Production defaults

The parts I care about most are the ones that matter at 3am:

- Graceful draining on SIGTERM: stop accepting, send GOAWAY, let in-flight calls finish for `drain_timeout`, exit.
- Deadlines, message size limits (which also cap gzip-decompressed size), connection and per-connection stream limits.
- TLS and mutual TLS. Bad TLS config stops the server instead of quietly falling back to plaintext.
- Unexpected exceptions reach clients as a generic `INTERNAL` error. The details go to your logs and `Rails.error`.
- Reflection is off unless you turn it on.

## The numbers

Each server ran as a single process, doing identical work per request, with 50 requests in flight. Requests per second, Apple M5, Ruby 3.4 with YJIT, ranges across two runs:

| Scenario | tonic-rails in Rails | `grpc` gem | Rails JSON |
|----------|--------------------:|-----------:|-----------:|
| empty request and response | 26k–31k | 10k–19k | 5.2k–5.3k |
| one 2 ms I/O call | 17k | 10k–12k | 3.8k–4.7k |
| 2 ms I/O, light CPU, 20 records | 7.6k–8.4k | 6.5k–6.7k | 3.7k–3.8k |
| three 5 ms I/O calls | 2.6k–2.7k | 2.3k–2.4k | 2.6k |
| server stream of 100 records | 2.1k–3.2k | 0.43k–0.49k | n/a |
| client stream of 100 records | 3.2k–4.5k | 1.6k | n/a |

On light calls that's 4.6–6× a Rails JSON endpoint and 1.4–3× the `grpc` gem. On streaming it's 4–7× the `grpc` gem.

Those numbers come with honest caveats:

- **Heavier handlers converge.** With three 5 ms I/O calls per request, nothing can beat roughly 3,300 calls/s at 50 in flight, and every server, pure Rust included, lands near the same number. If your handlers are dominated by slow queries or building big object graphs, expect a modest gain, not a multiple. tonic-rails is never slower, though.
- **The Rails executor isn't free.** Running each call inside it costs roughly 10–20 µs. That's visible on an empty RPC and invisible once a handler does real work, and it's what makes Rails code safe to call from a handler.
- **It's a laptop.** The `grpc` gem's light-call numbers varied almost 2× between runs. Treat the ratios as indicative.

[PERF.md](https://github.com/CodingAnarchy/tonic-rails/blob/main/PERF.md) has the full table, a pure-Rust ceiling for comparison, and the script to reproduce it.

## Trying it

```ruby
# Gemfile
gem "tonic-rails"
gem "google-protobuf"
```

It needs Ruby 3.3+ and Rails 7.1+. Precompiled gems cover Linux and macOS on x86_64 and arm64, so most people won't need a Rust toolchain. Other platforms build from source.

The [README](https://github.com/CodingAnarchy/tonic-rails#readme) walks through generating protobuf classes, writing handlers, testing them in-process with `Tonic::Rails::Testing`, and every configuration option. There's also a runnable [example app](https://github.com/CodingAnarchy/tonic-rails/tree/main/example).

## It's 0.1.0, and I'd like your bug reports

This is the first public release. The test suite runs real servers against the official `grpc` client, and the benchmarks above have pushed it hard, but none of that replaces someone else's traffic on someone else's servers.

If you try it, I'd like to hear how it goes, especially if it breaks. [Open an issue](https://github.com/CodingAnarchy/tonic-rails/issues) with your Ruby and Rails versions, your platform, your config, and whatever you can share about the failing call. If it's a security problem, please report it privately through [GitHub security advisories](https://github.com/CodingAnarchy/tonic-rails/security/advisories/new) instead.
