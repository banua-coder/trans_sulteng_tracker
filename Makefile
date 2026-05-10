CARGO_MANIFEST := apps/proxy/Cargo.toml

.PHONY: install dev dev-web dev-proxy build build-web build-proxy typecheck preview clean

install:
	pnpm install
	cargo fetch --manifest-path $(CARGO_MANIFEST)

dev:
	pnpm dev

dev-web:
	pnpm dev:web

dev-proxy:
	pnpm dev:proxy

build: build-web build-proxy

build-web:
	pnpm build

build-proxy:
	cargo build --release --manifest-path $(CARGO_MANIFEST)

typecheck:
	pnpm typecheck

preview:
	pnpm preview

clean:
	rm -rf apps/web/dist apps/proxy/target
