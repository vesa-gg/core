# VESA Backend Extraction — Migration Plan

*Written after reviewing `scrim-bot` and `VESAWeb` on disk (CLAUDE.md, `src/db`, `src/services/auth.ts`, `nhost/`, `DEPLOYMENT.md`, `worker/index.js`, `wrangler.jsonc`, `.github/workflows`, and `git ls-files` in both repos).*

## What the current codebases actually tell us

A few facts from the repos should drive the design, so they're worth stating up front:

- **scrim-bot** already has the seam you want: an abstract `DB` class with one concrete `NhostDb` implementation (ADR-0007), talking to Hasura over GraphQL using the **admin secret** — every query bypasses Hasura's row-level permission system entirely. Authorization is 100% custom app code: `AuthService.memberIsAdmin(member: GuildMember)` checks a Discord member's role IDs against an `admin_roles` table. This is your "admin key, server enforces authorization" model.
- **VESAWeb** does not have an equivalent server-side authorization layer today. The Angular app calls Nhost directly from the browser with the user's own JWT (Discord OAuth via Nhost Auth), and the one place VESAWeb *does* run server-side code — its Cloudflare Worker (`worker/index.js`) — already proxies Discord and Google Sheets calls and holds real secrets (`DISCORD_BOT_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY`). Notably, the Worker's own comment explains why it hand-rolls a Google JWT signer with Web Crypto instead of using `googleapis`: that package is Node-only and doesn't run in the Workers runtime. That constraint applies to anything you put in this Worker, including the new backend.
- **The Nhost project is currently split and inconsistent**, exactly as you described. `scrim-bot` tracks a real (if oddly double-nested — `nhost/nhost/config.yaml`, `nhost/nhost/migrations/…`) Nhost CLI project in git: 22 migrations, Hasura metadata, seeds, email templates. `VESAWeb` has its own local `nhost/`, `.nhost/`, `functions/`, `.secrets` — but `git ls-files` shows **none of it is tracked**; it's a stray local `nhost init` scaffold. Neither repo's CI runs `nhost`/`hasura migrate` against production anywhere — confirmed by reading both `.github/workflows/*`. So "production was always handled manually" is literally true of the tooling, not just a description.

Everything below is designed around those facts rather than a hypothetical clean-slate.

---

## 1. How the two apps should consume the new backend

**Recommendation: ship it as an installable TypeScript package (a library), not a third always-on service.**

Both consumers are perfectly capable hosts for a library:

- scrim-bot is a long-running Node process on Heroku — importing a package is a straight swap for its current in-repo `src/db`, `src/services`, etc.
- VESAWeb's Cloudflare Worker is the one place VESAWeb already runs trusted server-side code with secrets. `wrangler` bundles npm dependencies for you, so the Worker can `import` the same package scrim-bot uses.

Standing up a separate hosted API (option C below) would mean operating, monitoring, and paying for a third deployable, plus adding a network hop and a new failure mode, for a project with exactly two consumers you control. That's worth avoiding unless a future consumer shows up that *can't* import an npm package (a mobile app, a third-party integration, etc.) — cross that bridge if it happens.

**The constraint this puts on the package:** since it needs to run inside a Cloudflare Worker as well as Node, it must be written against **web-standard APIs only** — `fetch`, Web Crypto, `URL`, no `fs`, no Node-only SDKs (`@googleapis/sheets`, `@huggingface/hub` stay in the apps that use them, not in the shared package). This isn't a hypothetical restriction — VESAWeb already hit it once and worked around it by hand-rolling a Web Crypto JWT signer instead of using `googleapis`. `@nhost/nhost-js`, which both repos already use, is fetch-based and isomorphic, so this is very achievable; it just needs to be an explicit rule for anything added to the new package, not something someone discovers by watching a Workers deploy fail.

**Distribution mechanics — two viable options:**

| | Git-tag dependency | Private registry (GitHub Packages) |
|---|---|---|
| Setup | None — `npm install` supports `"vesa-core": "github:jacobheuman/vesa-core#v0.3.0"` directly | Requires publishing config + registry auth (`.npmrc`) in both consumer repos and CI |
| Release step | Tag + push | Tag + push + `npm publish` |
| Consumers get the build | Package needs a `prepare` script so `npm install` runs `tsc` on install (git installs don't ship a pre-built `dist/`) | `dist/` is built once at publish time, consumers just install it |
| Best for | Small number of consumers, low release volume — matches this project today | If release cadence grows or you want faster installs / stricter version resolution later |

Start with the git-tag approach — zero new infrastructure, and it reuses a pattern you already partly have (scrim-bot's `pr-bump-version.yml` + `bump-version.sh` already automate semver bumps; point that same machinery at the new repo). Migrate to GitHub Packages later if the `prepare`-script install step becomes annoying or you want a real changelog/registry experience.

Either way, pin both consumers to an exact tag (not a range) and bump deliberately — this is shared code two production surfaces depend on, so silent floating upgrades are the wrong default.

---

## 2. Handling the two authorization modes

Model this as an **actor**, not as "two modes of the whole package." Every backend action (the equivalent of today's service methods — `closeScrim`, `addPrio`, `insertLeagueSignup`, etc.) takes an actor argument that's one of:

```ts
type Actor =
  | { kind: "admin" }                                              // trusted server-to-server caller
  | { kind: "user"; nhostUserId: string; discordId: string; roleIds: string[] };
```

- **Admin actor** — used by scrim-bot, exactly like today's `AdminCommand`/`MemberCommand` split, just generalized past Discord commands. Nothing new to invent here; scrim-bot already holds the Nhost admin secret and already gates admin-only operations at the command layer.
- **User actor** — used by VESAWeb's Worker. This is the part that needs new work, because two things scrim-bot gets "for free" from being a live Discord bot don't exist on the website side:

  1. **Identity.** scrim-bot gets a `GuildMember` object straight from the Discord gateway. VESAWeb only has whatever Nhost's Discord OAuth flow put in the user's JWT. The package needs to verify that JWT itself (Nhost publishes a JWKS endpoint — verify with something like `jose`, no network call to Nhost needed per request) and pull the Discord user id out of it.
  2. **Role membership.** `AuthService.memberIsAdmin()` today takes `member.roles.cache` — a live list of Discord role IDs, only obtainable from an active gateway connection, i.e. only inside the bot process. The website has no such thing. **This is a real gap to close, not just an abstraction to add:** change `memberIsAdmin` to take a plain `roleIds: string[]` instead of a `GuildMember`, so scrim-bot can keep passing what it already has, and give VESAWeb's Worker a way to fetch the same information — a call to Discord's REST API (`GET /guilds/{guildId}/members/{discordId}`) using the bot token the Worker already holds (it's already proxying authenticated Discord calls today via `/discord-api`, so the token is already in place; you're reusing an existing secret, not adding one).

Once both call sites can produce a `roleIds: string[]`, every existing admin check (`admin_roles` table lookup) works unmodified for both actor kinds — you're not building a second authorization system, you're feeding the existing one from a second source of role data. Non-admin, "do this on your own behalf" actions (e.g. a user changing their own team's roster) get their own predicate — check `discordId`/`nhostUserId` against ownership of the row being modified, same shape as scrim-bot's existing `*NoAuth`-suffixed vs. auth-checked DB methods (`replaceTeammate` vs `replaceTeammateNoAuth`) — that pattern already models "caller-scoped" vs "pre-authorized" access; it just needs to live at the actor layer instead of being two separate DB methods per action.

Practically: the Worker validates the incoming JWT + fetches roles, builds a `user` Actor, and calls the shared package. It never receives or forwards the admin secret, and the browser never sees anything but its own Nhost session token — the trust boundary is exactly where it is today (server-side only), just extended to cover VESAWeb's Worker in addition to scrim-bot.

---

## 3. Getting the Nhost connection clean

This is the part with real risk if rushed, because — as you said — production has never actually been driven by what's in git. The tracked migrations in scrim-bot are a *reconstruction*, not a true history, and there's no guarantee they'd produce an identical schema if replayed from scratch (manual tweaks made directly in the Hasura console wouldn't be captured).

**One-time reconciliation, before wiring up any automatic deploys:**

1. Pick one canonical Nhost project directory — move scrim-bot's tracked `nhost/nhost/` (fix the double-nesting while you're at it) into the new repo. Delete VESAWeb's untracked `nhost/`, `.nhost/`, `functions/`, `.secrets` outright — `git ls-files` confirms none of it is real, it's a local scaffold that was never wired to anything.
2. Against the **real production** project (or a throwaway clone of it — safer, if Nhost/your plan supports project duplication), run a schema/metadata pull (`hasura migrate create baseline --from-server`, or the Nhost-CLI equivalent) and diff it against the migrations currently tracked in git. Reconcile any drift by hand — this is the step that actually answers "does replaying our migration history from empty produce what's live today," which as far as I can tell has never been verified.
3. Only after that diff is clean do you turn on automatic deploys. Doing it in the other order risks the first automatic deploy trying to "correct" production toward a schema that was never actually accurate.

**Automatic deploys, once reconciled:**

- Prefer **Nhost's built-in Git integration** (connect the Nhost project to the new repo + branch in the Nhost dashboard) over a hand-rolled GitHub Action that shells out to the CLI — it's built for exactly this, and you configure the subdirectory the project lives in, so nesting it under e.g. `/nhost` next to the package source is fine.
- Mirror VESAWeb's existing promotion ritual rather than inventing a new one: point the **dev** Nhost environment at the new repo's `main` (auto-deploy on every merge, matching `dev.vesa.gg`), and **prod** at a `release` branch promoted via `git merge --ff-only main` (matching how `vesa.gg` is promoted today). One mental model for both app code and schema changes.
- Add a PR check that validates migrations before merge (dry-run apply against a staging project) — the same "catch it in CI, not in prod" principle scrim-bot's `pr-check.yml` already applies to app code.

---

## 4. Repo name

Two reasonable options, differing mainly in what they imply about architecture:

- **`vesa-core`** — signals "shared domain library," matches the library-not-service recommendation above, and avoids implying it's a hosted, independently-running "backend" (which it explicitly isn't, per §1).
- **`vesa-backend`** — more immediately obvious to a future contributor skimming your GitHub org, but slightly misleading given it's consumed as a library rather than run as a server.

I'd lean **`vesa-core`** given the shape of the recommendation, but it's a coin flip either way — happy to go with whichever reads better to you.

---

## 5. Should the backend be DB-provider agnostic?

**Recommendation: no — keep the existing abstraction for *testability*, don't invest in real multi-provider portability.**

The reasoning:

- Nhost isn't just a database. It's Postgres + Hasura (queries) + Auth (Discord OAuth, JWT issuance) + Storage (`downloadFileById`/`downloadFileByName` already depend on it) + the migration/metadata deploy tooling that's the entire point of goal 3. Making the `DB` interface swappable only abstracts the query layer — Auth, Storage, and (especially) the migration format are inherently Nhost/Hasura-specific. You'd still be fully coupled to Nhost for three out of four concerns no matter how generic `DB.get/post/update/delete` becomes, so "provider agnostic" would be more illusion than insurance.
- Goal 3 actively pulls in the opposite direction from provider-agnosticism: automatic, clean deploys depend on migrations and metadata that are Postgres+Hasura-specific by construction. Optimizing the access layer for Hasura's model (permissions, actions, computed fields) is *more* valuable than hiding it behind a generic interface, not less.
- There's no concrete driver for portability today — nothing in either repo suggests a second backend is on the roadmap. The existing `DB` abstraction in scrim-bot earns its keep for a narrower reason: `DbMock` makes services unit-testable without a live database (already working well, per the existing Jest suite). That's worth keeping. General-purpose swappability is not.

Concretely: keep the `DB` abstract-class-plus-mock pattern for tests, but let the real implementation (`NhostDb`) freely use Nhost/Hasura-specific capabilities rather than hiding them. This is also a good moment to do the refactor your own CLAUDE.md already flags as a known limitation — splitting the single monolithic `DB` class into domain-scoped repositories (`ScrimRepository`, `PlayerRepository`, `LeagueRepository`, …) as ADR-0007 suggests — since you're moving the code anyway.

While in there, it's worth fixing the GraphQL-injection issue ADR-0010/CLAUDE.md already flag (`createValueString` interpolates values into query strings unescaped) — low cost to fix now, much higher cost once two production surfaces depend on the shared query builder instead of one.

---

## Suggested phased sequence

1. **Reconcile production schema** against tracked migrations (§3) — do this first and in isolation; it doesn't depend on any code migration and de-risks everything after it.
2. **Create the new repo** (`vesa-core` or chosen name); move the framework-agnostic pieces out of scrim-bot — `src/db`, `src/services`, `src/models`, the reconciled `nhost/` project. Leave Discord-specific glue (`Client.ts`, commands, events, the `discord.js` dependency itself) in scrim-bot.
3. **Decouple `AuthService`** from `discord.js`'s `GuildMember` → plain `roleIds: string[]`; introduce the `Actor` type from §2.
4. **Add user-actor support**: JWT verification against Nhost's JWKS, plus the Discord role-lookup path VESAWeb's Worker will call over REST using its existing bot token.
5. **Wire scrim-bot** to consume the package (git-tag dependency), delete the now-duplicated source, run the existing Jest suite as a regression check (it's already fairly thorough per CLAUDE.md — good safety net for this step specifically).
6. **Wire VESAWeb's Worker** to import the same package and expose the specific user-authorized actions the site needs. This is also the natural point to retire the transitional Google-Sheets league-signup path in `worker/index.js` (explicitly marked transitional in `DEPLOYMENT.md`, waiting on "the Nhost migration") — once the site can write to Nhost through properly authorized actions instead of a Sheets side-channel, that workaround goes away.
7. **Turn on Nhost's Git integration** against the new repo (dev → `main`, prod → `release`), now that step 1 has made the migration history trustworthy.
8. **Cleanup**: remove `nhost/` from scrim-bot, remove the dead local scaffold from VESAWeb, update both repos' `CLAUDE.md`/`README.md`/`DEPLOYMENT.md` to point at the new repo as the source of truth for DB/domain logic.

Steps 2–6 can happen on a branch without touching production; nothing user-facing changes until step 6 actually lands new routes, and step 7 is the only step that changes how the database itself gets deployed.

---

## Divergences and concerns since implementation started

*Added after moving `src/services`, `src/models`, `src/db`, and `src/repositories` verbatim out of scrim-bot and getting `core` to build and pass its test suite. This is a working list — update it as new gaps between this plan and the actual implementation turn up, rather than letting them go unrecorded again.*

### Node-only dependencies currently living in this package

§1's constraint says this package must run on web-standard APIs only — no `fs`, no Node-only SDKs — so it can run inside VESAWeb's Cloudflare Worker as well as Node. As of the initial extraction, three files violate that and will need work before step 6 (wiring VESAWeb's Worker) can happen:

- **`src/services/mmr.ts`** — caches API responses to a local file via `node:fs`. Needs a Workers-compatible cache (KV, Cache API) instead of the filesystem.
- **`src/services/hugging-face.ts`** — uses `undici`'s `Agent` for a custom-timeout fetch dispatcher. `undici` is Node-only; the Worker's native `fetch` already supports comparable timeout options and should be used instead.
- **`src/repositories/league-sheet.repository.ts`** — authenticates with `google-auth-library` against a service-account key read from a local file path (`service-account-key.json`), which is both Node-only (`fs`) and Heroku-deployment-specific (scrim-bot's `scripts/create-config.sh` writes that file at build time). Needs the key material injected via config instead of a static file path — the same approach the Worker already uses to hand-sign its own Google JWTs with Web Crypto (see `worker/index.js`, referenced in §1 above).

### `@googleapis/sheets` and `@huggingface/hub` ended up in the package anyway

§1 explicitly says Node-only SDKs like these "stay in the apps that use them, not in the shared package." In practice, moving `LeagueSheetRepository` and `HuggingFaceService` out of scrim-bot verbatim (per step 2) brought both dependencies — plus `google-auth-library` — into `core` along with them. This hasn't been reconciled with the plan yet. Two ways to close the gap when the Worker work starts:

- Move these two classes back into scrim-bot, and have `core` depend on interfaces instead — the same pattern already used for `ScrimNotifier`/`AlertSink` to keep `discord.js` out of `core`.
- Or accept the divergence and fix the three Node-only spots above so the SDKs can stay, since nothing about `@googleapis/sheets` or `@huggingface/hub` themselves is Worker-incompatible beyond how they're currently being invoked.
