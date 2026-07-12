# packages/

Reserved for code shared across the apps in [`apps/`](../apps) — e.g. a shared
TypeScript base config, ESLint config, or common domain types.

**Nothing lives here yet.** Each app in `apps/` currently owns its own tooling
and installs its dependencies independently (see the root `package.json`
scripts and `CLAUDE.md`). This directory is a placeholder that marks where
shared packages should go if/when they're extracted.

> When you do extract shared code here, do it with a working Node toolchain so
> you can actually build and test the change. The `apps/` reorganization that
> created this scaffold was performed in an environment with no Node/npm and no
> installed `node_modules`, so nothing here has been build-verified.
