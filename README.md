# Smash Scout

> Competitive intelligence SaaS for Super Smash Bros. Ultimate players. Built on the start.gg public API.

[![CI](https://github.com/churroxd8/smash-scout/actions/workflows/ci.yml/badge.svg)](https://github.com/churroxd8/smash-scout/actions/workflows/ci.yml)

## What is this?

Smash Scout aggregates and analyzes competitive Smash Ultimate history from start.gg, surfacing insights that the platform doesn't expose natively. Players can see their tournament trajectory, head-to-head records against any opponent, and matchup analytics - all from a single dashboard.

The core problem: serious Smash players have rich tournament data scattered across start.gg with limited UX for analytics. Questions like "am I improving?", "who do I need to beat to climb?", or "who is this player I'm facing tomorrow?" are tedious to answer manually.

## Status

🚧 **Work in progress** - currently in week 1 of a 12-week MVP build.

### Roadmap

- [x] Week 1 - Project foundations (Typescript, Drizzle, CI/CD)
- [x] Week 2 - OAuth with start.gg
- [ ] Week 3 - start.gg client with rate limiting
- [ ] Week 4 - Async ingestion worker (BullMQ + Redis)
- [ ] Week 5 - Player Dossier dashboard
- [ ] Week 6 - Tournament detail view with progression chart
- [ ] Week 7 - Matchup analysis with character data
- [ ] Week 8 - Player search and scouting
- [ ] Week 9 - Head-to-Head feature
- [ ] Week 10 - Smash Wrapped (shareable cards)
- [ ] Week 11 - Testing, observability, deployment
- [ ] Week 12 - Documentation and launch

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Single language across the stack |
| Framework | Next.js 16 (App Router) | Fullstack in one project, Server Components |
| Database | PostgreSQL (Neon) | Mature, JSON support, generous free tier |
| ORM | Drizzle | Type-safe, SQL-close, lightweight |
| Queue | BullMQ + Redis (Upstash) | Standard for async jobs in Node |
| Auth | Auth.js with start.gg provider | OAuth 2.0 |
| UI | React + Tailwind + shadcn/ui | Production-grande design system |
| Hosting | Vercel + Railway | HTTP on Vercel, worker on Railway |
| CI | GitHub Actions | Lint + typecheck + build on every push |

## Architecture highlights

The system splits into two paths:

**Synchronous path (UI <-> DB)**: every user-facing request reads from a local Postgres. Latency target: <100ms. Never touches start.gg directly.

**Asynchronous path (Worker <-> start.gg)**: ingestion runs in a dedicated worker with its own rate limiter (60 req/min, validated empirically). Triggered by user actions (login, refresh, scouting), not by reactive page loads.

This separation guarantees the dashboard responds instantly even when start.gg is slow or rate-limiting us.

For the full architecture rationale see [ARCHITECTURE.md](./ARCHITECTURE.md).
For empirical fidings about the start.gg API see [EXPLORATION_LOG.md](./EXPLORATION_LOG.md).

## Local development

### Prerequisites

- Node.js 22+ (use [nvm](https://github.com/nvm-sh/nvm) to manage versions)
- A [Neon](https://neon.tech) account (or any PostgreSQL 14+ instance)
- A [start.gg developer token](https://developer.start.gg/)

### Setup

Clone and install dependencies:

```bash
git clone git@github.com:churroxd8/smash-scout.git
cd smash-scout
npm install
```

Configure environment variables:

```bash
cp .env.example .env.local
# Edit .env.local with your values
```

Run database migrations and seed:

```bash
npm run db:migrate
npm run db:seed:characters
```

Start the development server:

```bash
npm run dev
```

App runs at http://localhost:3000

### Useful scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript check without emit |
| `npm run format` | Run Prettier |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:migrate` | Apply migrations to the database |
| `npm run db:seed:characters` | Seed character data from start.gg |
| `rm -rf .next` | Si el typecheck/build da errores raros que no dan sentido, borramos caché |

## Project structure

```
smash-scout/
├── app/                      # Next.js App Router pages
├── db/                       # Database layer
│   ├── schema.ts             # Drizzle schema (9 tables)
│   ├── index.ts              # DB client
│   ├── migrations/           # Generated migrations
│   └── seeds/                # Seed scripts
├── lib/                      # Shared utilities
├── components/               # React components (coming soon)
├── worker/                   # Async ingestion worker (coming soon)
└── .github/workflows/        # CI configuration
```

## License

This project is built as a portfolio piece. Source code available for reference; not licensed for redistribution.

## Author

Built by [Luis Mario Sainz](https://github.com/churroxd8) as a learning project to demonstrate fullstack and systems engineering skills.