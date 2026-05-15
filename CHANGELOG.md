# Changelog

All notable releases of cektrans are recorded here. Generated automatically by `release-finalize.yml`.

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


