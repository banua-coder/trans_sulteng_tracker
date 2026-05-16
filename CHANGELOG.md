# Changelog

All notable releases of cektrans are recorded here. Generated automatically by `release-finalize.yml`.

## v0.6.12 — 2026-05-16

### 🐛 Bug Fixes

- fix(web): origin selector clipped under sticky tabs in plan tab (86fb6d2)

### 🧹 Chore

- chore: bump version to 0.6.12 (a248b29)



## v0.6.11 — 2026-05-16

### 🐛 Bug Fixes

- fix(web): trip planner origin/dest inputs crop on narrow viewports (0389477)

### 🧹 Chore

- chore: bump version to 0.6.11 (01d96d8)



## v0.6.10 — 2026-05-16

### 🐛 Bug Fixes

- fix(web): MobileRoutesPanel sticky tabs/search inside flex parent (0ee6af7)

### 🧹 Chore

- chore: bump version to 0.6.10 (d422ba8)



## v0.6.9 — 2026-05-16

### 🐛 Bug Fixes

- fix(web): selection back-stack + sticky tabs/search + slim image (069e443)

### 🧹 Chore

- chore: bump version to 0.6.9 (430bbc7)



## v0.6.8 — 2026-05-15

### 🐛 Bug Fixes

- fix(proxy): native alpine build (24 MB, no glibc/musl TLS conflict) (b602888)

### 🧹 Chore

- chore: bump version to 0.6.8 (0f5afc1)



## v0.6.7 — 2026-05-15

### 🐛 Bug Fixes

- fix(proxy): runtime to alpine, restore curl healthcheck (ba9db6a)

### 🧹 Chore

- chore: bump version to 0.6.7 (dfc0085)



## v0.6.6 — 2026-05-15

### 🐛 Bug Fixes

- fix(deploy): dump proxy logs before rollback so we can debug crashes (c8dd5d3)

### 🧹 Chore

- chore: bump version to 0.6.6 (9e49609)



## v0.6.5 — 2026-05-15

### 🐛 Bug Fixes

- fix(deploy): drop curl healthcheck (distroless has no curl) (722926d)

### 🧹 Chore

- chore: bump version to 0.6.5 (64f8321)



## v0.6.4 — 2026-05-15

### 🐛 Bug Fixes

- fix(deploy): use $PWD-relative state paths + mkdir -p the parent (23b40fa)

### 🧹 Chore

- chore: bump version to 0.6.4 (470d516)



## v0.6.3 — 2026-05-15

### 🐛 Bug Fixes

- fix(proxy): install make + linux-libc-dev for vendored openssl (9d02ac0)

### 🧹 Chore

- chore: bump version to 0.6.3 (d87dd6d)



## v0.6.2 — 2026-05-15

### 🐛 Bug Fixes

- fix(proxy): vendor openssl-sys for musl cross-compile (c03b5b7)

### 🧹 Chore

- chore: bump version to 0.6.2 (eae454d)



## v0.6.1 — 2026-05-15

### 🐛 Bug Fixes

- fix(proxy): pin musl target in rust-toolchain.toml (720a93a)

### 🧹 Chore

- chore: bump version to 0.6.1 (104dc4a)



## v0.6.0 — 2026-05-15

### ✨ Features

- feat(deploy): auto-rollback on failure with 24h image retention (#15) (3fa3988)

### ⚡ Performance

- perf(web): shallow-reactive bus map + async panel chunks (#14) (1b37727)

### ♻️ Refactor

- refactor(web): move derived state into pinia stores (#13) (9aebe08)

### 👷 CI

- ci(release): dev-bump on release, max-semver back-merge, grouped changelog (#8) (017a9af)

### 🧹 Chore

- chore: back-merge main into develop after v0.4.8 (#7) (f1d6f62)
- chore: bump dev version to 0.6.0 after v0.5.0 release (#10) (efd7098)
- chore: back-merge main into develop after v0.5.0 (#11) (8963d5b)
- chore(proxy): slim build (size profile + musl + distroless + dep audit) (#12) (a3c3777)

### 📌 Other

- Merge pull request #2 from banua-coder/backmerge/main-to-develop-v0.4.6 (1fb6345)
- release: cektrans v0.4.7 (#4) (#5) (254a460)
- Merge remote-tracking branch 'origin/main' into release/v0.6.0 (3940f55)



## v0.5.0 — 2026-05-15

### ✨ Features

- feat(map): show only rideable buses when a trip plan is selected (c666d43)

### 🐛 Bug Fixes

- fix(map, planner): widen rideable filter + drop duplicate transfer disc (6aa8993)
- fix(ci): switch CHANGELOG.md prepend heredoc to quoted form (41388e3)

### 👷 CI

- ci(release): dev-bump on release, max-semver back-merge, grouped changelog (#8) (017a9af)

### 🧹 Chore

- chore: back-merge main into develop after v0.4.8 (#7) (f1d6f62)
- chore: bump version to 0.5.0 (99ee8a2)

### 📌 Other

- Merge pull request #2 from banua-coder/backmerge/main-to-develop-v0.4.6 (1fb6345)
- release: cektrans v0.4.7 (#4) (#5) (254a460)
- Merge branch 'main' into release/v0.5.0 (f465574)


