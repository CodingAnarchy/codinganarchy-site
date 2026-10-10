---
name: tonic-rails
tagline: gRPC endpoints for Rails, with the HTTP/2 transport running in Rust via tonic.
language: Ruby + Rust
status: active
repo: https://github.com/CodingAnarchy/tonic-rails
order: 30
---

tonic-rails brings gRPC to Rails applications without giving up Rails controllers, routing, or middleware. The transport layer (HTTP/2 framing, connection management, flow control, TLS) runs in Rust on [tonic](https://github.com/hyperium/tonic), exposed to Ruby as a native extension built with [Magnus](https://github.com/matsadler/magnus). Protobuf handling and business logic stay in Ruby.

The transport runs outside Ruby's GVL. Application RPCs cross into Ruby only to run the handler, passing raw bytes in both directions, and the GVL is released again during blocking I/O so other dispatch threads keep moving. Health checks and server reflection are served entirely in Rust, so they never touch the GVL at all.
