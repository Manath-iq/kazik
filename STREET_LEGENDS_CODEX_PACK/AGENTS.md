# AGENTS.md — Street Legends project instructions

You are implementing the **STREET LEGENDS Telegram Mini App MVP**. Read `STREET_LEGENDS_MVP.md` **fully** and inspect `references/README.md` plus the supplied reference screenshots before changing files. Its scope, color palette, gameplay and acceptance criteria are authoritative. Work in Russian for product copy and developer progress notes.

## Core mandates
1. Deliver a **playable** portrait-oriented, pixel-art Vampire-Survivors-style street run with Phaser and a functional React mobile shell, not a design-only demo.
2. Two core activities are street runs and **virtual-currency-only** casino. Gangs and rankings connect to run records; jobs/businesses/property are deliberately simple. No RPG character upgrades outside a run.
3. Dark near-black pixel-art theme. Never use the brown earth tones from the inspiration screenshots.
4. Real server: Hono + Cloudflare Workers + D1. Money, bets, payouts, property and records **must** be validated/saved on the server. Be honest about limits of client-side anti-cheat.
5. Never use real-money gambling, paid or withdrawable chips, virtual-asset-to-cash exchanges, or P2P wager transfers. Do not add payments in MVP.
6. Use original/licensed pixel sprites; no copied protected game assets.
7. Validate Telegram initData server side, enforce session/authorization, webhook secret and idempotent money movements.
8. `DEV MODE` auth may exist for local preview only and must be impossible to enable in production.
9. Never silently substitute mocked functionality for acceptance criteria. Track incomplete work in `PROGRESS.md`.
10. Before every final status, run available lint, typecheck, tests and production builds. Do not claim tests passed if not executed.

## Workflow
- First inspect repository and dependencies, establish scripts, migrations, UI shell and a run-ready vertical slice.
- Implement phases in order from the master spec; test incrementally.
- Keep gameplay balance constants centralized; keep all client/server monetary state typed.
- Document exact startup/deployment steps and known security limitations in `README.md`.
- If external credentials are missing, finish local development support and explain how to configure Telegram/Cloudflare, without inventing secrets.
