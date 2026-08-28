# Changelog

All notable releases of cektrans are recorded here. Generated automatically by `release-finalize.yml`.

## v0.10.0 — 2026-08-28

### ✨ Features

- feat(web): replace CARTO raster tiles with OpenFreeMap vector tiles (6db5657)

### 🐛 Bug Fixes

- fix(web): reach a terminal offline state when the initial socket handshake never connects (fbef725)
- fix(web): gate onboarding tour launch to the city route (17d8b13)
- fix(web): raise Home footer version-label contrast from 2.35:1 to ~7:1 (5ba3a29)
- fix(web): darken stone-500/stale token to clear 4.5:1 in light mode (a5dc8c6)
- fix(web): show the real backend error on mobile, not a generic empty state (bccf8c5)
- fix(web): clip TopBar city-switcher fallback to a two-letter monogram (eaabbbd)
- fix(web): raise undersized text on the map view to an 11px floor (d221268)
- fix(web): soften corridor spotlight-dim from 0.1 to 0.35 (507c5d6)
- fix(web): add a minimum-step backstop so tours never degrade to one orphaned popover (8597d4f)

### 👷 CI

- ci: add path filters, concurrency, and job timeouts (5a50e50)
- ci: add scheduled CVE audit workflow (5719dfb)

### 🧹 Chore

- chore: bump dev version to 0.9.0 after v0.8.0 release (a9cbb6a)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (ae83a43)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (b60ce00)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (a6e42f7)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (45afb6a)
- chore(deps): bump shell-quote to >=1.8.4 — CVE-2026-9277 (f4dfe16)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (2fa3d8d)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (5248b19)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (f71acaf)
- chore(deps): fix CVE audit findings across JS/TS and Rust deps (c040d93)
- chore(deps): bump openssl to 0.10.81 — GHSA-phqj-4mhp-q6mq (91391a6)
- chore: sync cektrans-proxy self-version in Cargo.lock to 0.9.0 (225af4b)
- chore: reconcile lockfile after merging develop (8eb7a9e)
- chore: bump dev version to 0.10.0 after v0.9.0 release (6479635)

### 📌 Other

- Merge pull request #80 from banua-coder/chore/bump-dev-version-v0.9.0 (d177cc0)
- Merge pull request #81 from banua-coder/backmerge/main-to-develop-v0.8.0 (dce5bb5)
- Merge pull request #83 from banua-coder/backmerge/main-to-develop-v0.8.1 (e70201d)
- Merge pull request #85 from banua-coder/backmerge/main-to-develop-v0.8.2 (1e41787)
- Merge pull request #87 from banua-coder/backmerge/main-to-develop-v0.8.3 (a68962b)
- Merge pull request #90 from banua-coder/backmerge/main-to-develop-v0.8.4 (88a5e31)
- Merge pull request #91 from banua-coder/feature/optimize-actions-minutes (84c70da)
- Merge pull request #92 from banua-coder/chore/bump-shell-quote-cve-2026-9277 (812b0df)
- Merge pull request #95 from banua-coder/backmerge/main-to-develop-v0.8.5 (e85ca24)
- Merge pull request #97 from banua-coder/backmerge/main-to-develop-v0.8.6 (0a984a7)
- Merge pull request #101 from banua-coder/backmerge/main-to-develop-v0.8.7 (d73005a)
- Merge remote-tracking branch 'origin/main' into backmerge/main-to-develop-v0.8.7 (f9be188)
- Merge pull request #103 from banua-coder/backmerge/main-to-develop-v0.8.7 (cd70d0d)
- Merge remote-tracking branch 'origin/develop' into chore/cve-audit-fixes-2026-08 (eceb254)
- Merge pull request #102 from banua-coder/chore/cve-audit-fixes-2026-08 (95b2f8f)
- Merge pull request #104 from banua-coder/fix/ux-critique-p0-p1-findings (252617e)
- Merge pull request #105 from banua-coder/fix/corridor-spotlight-dim (c55a4e0)
- Merge pull request #106 from banua-coder/fix/tour-min-step-threshold (a31a6ad)
- polish(web): rework the landing page hero — remove eyebrow, add entrance motion + richer card interactions (c476790)
- Merge pull request #107 from banua-coder/feat/landing-page-polish (ac391fd)
- Merge pull request #110 from banua-coder/backmerge/main-to-develop-v0.9.0 (1867114)
- Merge pull request #109 from banua-coder/chore/bump-dev-version-v0.10.0 (55bfb9e)
- Merge pull request #115 from banua-coder/feat/openfreemap-vector-tiles (edad6b4)



## v0.9.0 — 2026-08-22

### 🐛 Bug Fixes

- fix(web): reach a terminal offline state when the initial socket handshake never connects (fbef725)
- fix(web): gate onboarding tour launch to the city route (17d8b13)
- fix(web): raise Home footer version-label contrast from 2.35:1 to ~7:1 (5ba3a29)
- fix(web): darken stone-500/stale token to clear 4.5:1 in light mode (a5dc8c6)
- fix(web): show the real backend error on mobile, not a generic empty state (bccf8c5)
- fix(web): clip TopBar city-switcher fallback to a two-letter monogram (eaabbbd)
- fix(web): raise undersized text on the map view to an 11px floor (d221268)
- fix(web): soften corridor spotlight-dim from 0.1 to 0.35 (507c5d6)
- fix(web): add a minimum-step backstop so tours never degrade to one orphaned popover (8597d4f)

### 👷 CI

- ci: add path filters, concurrency, and job timeouts (5a50e50)
- ci: add scheduled CVE audit workflow (5719dfb)

### 🧹 Chore

- chore: bump dev version to 0.9.0 after v0.8.0 release (a9cbb6a)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (ae83a43)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (b60ce00)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (a6e42f7)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (45afb6a)
- chore(deps): bump shell-quote to >=1.8.4 — CVE-2026-9277 (f4dfe16)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (2fa3d8d)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (5248b19)
- chore: align version to 0.9.0 for back-merge (develop was ahead) (f71acaf)
- chore(deps): fix CVE audit findings across JS/TS and Rust deps (c040d93)
- chore(deps): bump openssl to 0.10.81 — GHSA-phqj-4mhp-q6mq (91391a6)
- chore: sync cektrans-proxy self-version in Cargo.lock to 0.9.0 (225af4b)
- chore: reconcile lockfile after merging develop (8eb7a9e)

### 📌 Other

- Merge pull request #80 from banua-coder/chore/bump-dev-version-v0.9.0 (d177cc0)
- Merge pull request #81 from banua-coder/backmerge/main-to-develop-v0.8.0 (dce5bb5)
- Merge pull request #83 from banua-coder/backmerge/main-to-develop-v0.8.1 (e70201d)
- Merge pull request #85 from banua-coder/backmerge/main-to-develop-v0.8.2 (1e41787)
- Merge pull request #87 from banua-coder/backmerge/main-to-develop-v0.8.3 (a68962b)
- Merge pull request #90 from banua-coder/backmerge/main-to-develop-v0.8.4 (88a5e31)
- Merge pull request #91 from banua-coder/feature/optimize-actions-minutes (84c70da)
- Merge pull request #92 from banua-coder/chore/bump-shell-quote-cve-2026-9277 (812b0df)
- Merge pull request #95 from banua-coder/backmerge/main-to-develop-v0.8.5 (e85ca24)
- Merge pull request #97 from banua-coder/backmerge/main-to-develop-v0.8.6 (0a984a7)
- Merge pull request #101 from banua-coder/backmerge/main-to-develop-v0.8.7 (d73005a)
- Merge remote-tracking branch 'origin/main' into backmerge/main-to-develop-v0.8.7 (f9be188)
- Merge pull request #103 from banua-coder/backmerge/main-to-develop-v0.8.7 (cd70d0d)
- Merge remote-tracking branch 'origin/develop' into chore/cve-audit-fixes-2026-08 (eceb254)
- Merge pull request #102 from banua-coder/chore/cve-audit-fixes-2026-08 (95b2f8f)
- Merge pull request #104 from banua-coder/fix/ux-critique-p0-p1-findings (252617e)
- Merge pull request #105 from banua-coder/fix/corridor-spotlight-dim (c55a4e0)
- Merge pull request #106 from banua-coder/fix/tour-min-step-threshold (a31a6ad)
- polish(web): rework the landing page hero — remove eyebrow, add entrance motion + richer card interactions (c476790)
- Merge pull request #107 from banua-coder/feat/landing-page-polish (ac391fd)



## v0.8.7 — 2026-07-06

### 🐛 Bug Fixes

- fix(web): ride HUD stays fresh under fake-GPS + PWA install (ac65564)

### 🧹 Chore

- chore: bump version to 0.8.7 (7dab3ac)



## v0.8.6 — 2026-06-13

### 🐛 Bug Fixes

- fix(web): subscribe grace period + drop false operating-hours claims (0db1b0f)

### 🧹 Chore

- chore: bump version to 0.8.6 (52f60e7)



## v0.8.5 — 2026-06-13

### 🐛 Bug Fixes

- fix(web): state-aware bus-loading badge + retry subscribe + drop live pill (81e1b04)

### 🧹 Chore

- chore: bump version to 0.8.5 (4f664bc)



## v0.8.4 — 2026-06-02

### 👷 CI

- ci: migrate actions to node 24 runtime (db24128)

### 🧹 Chore

- chore: bump version to 0.8.4 (2865880)



## v0.8.3 — 2026-06-02

### 🐛 Bug Fixes

- fix(web): trip planner GPS second-try + tap-on-map invisible success (a7407b9)

### 🧹 Chore

- chore: bump version to 0.8.3 (16ef4c6)



## v0.8.2 — 2026-05-23

### 🐛 Bug Fixes

- fix(web): halte filter chips refresh on city switch + pin Semua (560ed40)

### 🧹 Chore

- chore: bump version to 0.8.2 (dc5bde8)



## v0.8.1 — 2026-05-23

### 🐛 Bug Fixes

- fix(web): spell plate numbers for TTS instead of reading as full numbers (7145538)

### 🧹 Chore

- chore: bump version to 0.8.1 (7729366)



## v0.8.0 — 2026-05-23

### ✨ Features

- feat(web): printable offline corridor map + halte list corridor filter (#75) (6dbfcf1)
- feat(web): TTS announcer + Settings modal + release-aware product tour (d0b1f93)
- feat(web): wire bus + halte voice announcements (Phase 2) (228518c)
- feat(web): full feature tour for first-time users (619ebaa)
- feat(web): Phase 1 — ride store + state machine + unit tests (787114b)
- feat(web): Phase 2 — RideHud + start button + voice cues (1701447)
- feat(web): Phase 3 — persistence + resume banner + battery warning (8383ba8)
- feat(web): Phase 4 — Strava-style share card + Web Share (1fa4b98)

### 🐛 Bug Fixes

- fix(web): TTS silently dropped after chime (bb9cc54)
- fix(web): serialize announces + handle backgrounded tab (96c7d1f)
- fix(web): unwedge Chrome speechSynthesis before each speak (ce62b68)
- fix(web): bundle operator logos for share card (fcbdda3)
- fix(web): share card uses real corridor polyline, not straight chord (7f85237)

### 📝 Docs

- docs(plans): TTS announcer phase 1 design (d84a04e)

### 🧹 Chore

- chore: align version to 0.8.0 for back-merge (develop was ahead) (21098ee)
- chore: align version to 0.8.0 for back-merge (develop was ahead) (789e77c)
- chore: align version to 0.8.0 for back-merge (develop was ahead) (797fe33)

### 📌 Other

- Merge pull request #70 from banua-coder/backmerge/main-to-develop-v0.7.1 (11b2966)
- Merge pull request #72 from banua-coder/backmerge/main-to-develop-v0.7.2 (bcee1dd)
- Merge pull request #74 from banua-coder/backmerge/main-to-develop-v0.7.3 (cddffb2)
- Merge pull request #76 from banua-coder/feat/tts-announcer-phase1 (fef8d37)
- Merge pull request #77 from banua-coder/feat/onboarding-full-tour (0ed7307)
- Merge pull request #78 from banua-coder/feat/companion-mode (f6a1fb7)



## v0.7.3 — 2026-05-22

### 🐛 Bug Fixes

- fix(web): bus opacity tweaks + drop stale buses on city switch (5409ca2)

### 🧹 Chore

- chore: bump version to 0.7.3 (0dae06b)



## v0.7.2 — 2026-05-20

### 🐛 Bug Fixes

- fix(web): selected bus invisible when toward is stale but next stop is on active leg (d07f1c4)

### 🧹 Chore

- chore: bump version to 0.7.2 (20802ad)



## v0.7.1 — 2026-05-20

### 🐛 Bug Fixes

- fix(web): halte visibility + ignore off-corridor clicks under focus (52cf5c7)

### 🧹 Chore

- chore: bump dev version to 0.8.0 after v0.7.0 release (6b9a6fa)
- chore: bump version to 0.7.1 (f784531)

### 📌 Other

- Merge pull request #67 from banua-coder/chore/bump-dev-version-v0.8.0 (274bc7d)
- Merge pull request #68 from banua-coder/backmerge/main-to-develop-v0.7.0 (494d98f)



## v0.7.0 — 2026-05-20

### ✨ Features

- feat(web): per-corridor filter on halte detail + direction-aware corridor focus (#65) (f36392c)

### 🧹 Chore

- chore: bump dev version to 0.7.0 after v0.6.0 release (8ab82c4)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (4d79e2e)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (3cef333)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (c8162e9)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (ce2383d)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (9345bb9)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (7affee6)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (86898da)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (ce71efc)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (7364f07)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (6383897)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (79df681)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (43b88a3)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (aa69378)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (553d2df)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (ed9a9d2)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (f45c43e)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (21536a7)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (4358eb9)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (9795602)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (fd6bfeb)
- chore: back-merge main into develop after v0.6.21 (#60) (2ecb053)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (d0fd53a)
- chore: align version to 0.7.0 for back-merge (develop was ahead) (324f2b6)

### 📌 Other

- Merge pull request #17 from banua-coder/chore/bump-dev-version-v0.7.0 (029074f)
- Merge pull request #18 from banua-coder/backmerge/main-to-develop-v0.6.0 (70fc4ab)
- Merge pull request #20 from banua-coder/backmerge/main-to-develop-v0.6.1 (be98915)
- Merge pull request #22 from banua-coder/backmerge/main-to-develop-v0.6.2 (5701076)
- Merge pull request #24 from banua-coder/backmerge/main-to-develop-v0.6.3 (2b0748a)
- Merge pull request #26 from banua-coder/backmerge/main-to-develop-v0.6.4 (e3c92cb)
- Merge pull request #28 from banua-coder/backmerge/main-to-develop-v0.6.5 (178f364)
- Merge pull request #30 from banua-coder/backmerge/main-to-develop-v0.6.6 (0fddf84)
- Merge pull request #32 from banua-coder/backmerge/main-to-develop-v0.6.7 (84fc82f)
- Merge pull request #34 from banua-coder/backmerge/main-to-develop-v0.6.8 (7969e96)
- Merge pull request #36 from banua-coder/backmerge/main-to-develop-v0.6.9 (0d5d586)
- Merge pull request #38 from banua-coder/backmerge/main-to-develop-v0.6.10 (2511cbc)
- Merge pull request #40 from banua-coder/backmerge/main-to-develop-v0.6.11 (09cd0fd)
- Merge pull request #42 from banua-coder/backmerge/main-to-develop-v0.6.12 (ba61818)
- Merge pull request #44 from banua-coder/backmerge/main-to-develop-v0.6.13 (0b7d738)
- Merge pull request #46 from banua-coder/backmerge/main-to-develop-v0.6.14 (6e86b8e)
- Merge pull request #48 from banua-coder/backmerge/main-to-develop-v0.6.15 (05a0a55)
- Merge pull request #50 from banua-coder/backmerge/main-to-develop-v0.6.16 (fad1ad8)
- Merge pull request #52 from banua-coder/backmerge/main-to-develop-v0.6.17 (08b4b6f)
- Merge pull request #54 from banua-coder/backmerge/main-to-develop-v0.6.18 (846b24a)
- Merge pull request #56 from banua-coder/backmerge/main-to-develop-v0.6.19 (34d833d)
- Merge pull request #58 from banua-coder/backmerge/main-to-develop-v0.6.20 (f22a32f)
- Merge branch 'develop' into pr-62 (6566f25)
- Merge branch 'develop' into pr-64 (a0d9374)
- Merge pull request #62 from banua-coder/backmerge/main-to-develop-v0.6.22 (c38ef48)
- Merge remote-tracking branch 'origin/develop' into pr-64 (d9011bc)
- Merge pull request #64 from banua-coder/backmerge/main-to-develop-v0.6.23 (025dc0c)



## v0.6.23 — 2026-05-19

### 🐛 Bug Fixes

- fix(deps): bump vite to ^6.4.2 (GHSA-4w7w-66w2-5vf9, GHSA-67mh-4wv8-2f99) (33d53b0)

### 🧹 Chore

- chore: bump version to 0.6.23 (f47d0f7)



## v0.6.22 — 2026-05-19

### 🐛 Bug Fixes

- fix(deps): override ws to >=8.20.1 (GHSA-58qx-3vcg-4xpx) (ddc5ae0)

### 🧹 Chore

- chore: bump version to 0.6.22 (74d4cc9)



## v0.6.21 — 2026-05-17

### ✨ Features

- feat(web): corridor badges per halte row + extract rows/badges to brt store (21013f3)

### ♻️ Refactor

- refactor(web): extract SheetStickyHeader + DirectionSelector (5c8a77d)

### 🧹 Chore

- chore: bump version to 0.6.21 (f38f3f5)



## v0.6.20 — 2026-05-17

### 🐛 Bug Fixes

- fix(web): corridor timeline ignores premature new_shel_t (f14912a)

### 🧹 Chore

- chore: bump version to 0.6.20 (b15e37c)



## v0.6.19 — 2026-05-17

### 🐛 Bug Fixes

- fix(web): dwell + K2A reverse + K4A premature skip (0317363)

### 🧹 Chore

- chore: bump version to 0.6.19 (3c6742e)



## v0.6.18 — 2026-05-17

### 🐛 Bug Fixes

- fix(web): bus detail upcoming list now shows AT STOP during dwell (b20c781)

### 🧹 Chore

- chore: bump version to 0.6.18 (a2a46ac)



## v0.6.17 — 2026-05-17

### 🐛 Bug Fixes

- fix(web): corridor timeline shows buses from both directions (9d73e1a)

### 🧹 Chore

- chore: bump version to 0.6.17 (572c260)



## v0.6.16 — 2026-05-16

### 🐛 Bug Fixes

- fix(web): corridor timeline drops buses with stale/wrong-dir new_shel_t (a1db159)
- fix(web): corridor timeline + passed halte lingering in upcoming list (abca80c)

### 🧹 Chore

- chore: bump version to 0.6.16 (123f472)



## v0.6.15 — 2026-05-16

### ✨ Features

- feat(web): donate modal — prominent Saweria CTA + warmer copy (0299bae)

### 🧹 Chore

- chore: bump version to 0.6.15 (ac17d38)



## v0.6.14 — 2026-05-16

### ✨ Features

- feat(web): donate button + QR modal in top bar (d9e8781)

### 🧹 Chore

- chore: bump version to 0.6.14 (bd28a1e)



## v0.6.13 — 2026-05-16

### 🐛 Bug Fixes

- fix(web): SPA fallback env var name (SERVER_FALLBACK_PAGE, not SERVER_PAGE_FALLBACK) (d0e6f39)

### 🧹 Chore

- chore: bump version to 0.6.13 (fa2eff9)



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


