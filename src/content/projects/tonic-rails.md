---
name: tonic-rails
tagline: Serve gRPC from Rails, with the transport handled by tonic in Rust.
language: Ruby + Rust
status: active
repo: https://github.com/CodingAnarchy/tonic-rails
links:
  - label: RubyGems
    url: https://rubygems.org/gems/tonic-rails
order: 30
---

Think of it like Puma for gRPC. HTTP/2, TLS, flow control, keepalives, health checks, and reflection all run in Rust on [tonic](https://github.com/hyperium/tonic), outside Ruby's GVL. Your handlers are plain Ruby classes that receive protobuf messages and return them, inside the Rails executor, with your models, caches, and error reporting all available.

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

- **All four RPC kinds**: unary, server streaming, client streaming, and bidirectional, with backpressure in both directions.
- **Production defaults**: graceful draining on SIGTERM, health checks that flip to `NOT_SERVING` during shutdown, deadlines, size and connection limits, load shedding, gzip, TLS, and mutual TLS.
- **Fast where the transport matters**: light RPCs ran at 4.6–6× an equivalent Rails JSON endpoint and 1.4–3× the official `grpc` gem, and server streaming at 4–7× the `grpc` gem. See [PERF.md](https://github.com/CodingAnarchy/tonic-rails/blob/main/PERF.md).
- **No Rust toolchain needed** on Linux and macOS (x86_64 and arm64), which get precompiled gems.

```ruby
gem "tonic-rails"
gem "google-protobuf"
```

Requires Ruby 3.3+ and Rails 7.1+. Version 0.1.0 is the first public release; [bug reports](https://github.com/CodingAnarchy/tonic-rails/issues) are welcome.
