# PortMasters 2

PortMasters 2 is a browser based multiplayer trading game set along the Silk Road. Captains share a harbor, advance through a voyage together, trade goods and Gold, operate artisan workshops, meet pirate risk, and compete for Reputation.

The application runs as one Node.js process. Its Next.js interface, API routes, and Socket.IO realtime service share the same HTTP server and the same port.

## Requirements

Node.js 22 and npm 11 are required. A platform with native SQLite support is also required.

This repository uses npm and its package lock file. Bun, pnpm, and Yarn are not supported.

## Start locally

Copy the example environment file, install dependencies, then start the application.

```bash
cp .env.example .env.local
npm ci
npm run db:push
npm run dev
```

Open [http://localhost:2154](http://localhost:2154).

Register a captain, create or join a harbor, and start when two captains are present. Use separate browser profiles when testing two local accounts because tabs on one origin share a session cookie.

## Voyage rules

New voyages draw cargo, recipes, Boons, and modules from the founding catalog and the specialties chosen for that harbor. Fair Winds runs for eight rounds and introduces staple contracts and forecasts. Open Waters runs for twelve rounds and opens the wider charters in rounds four and eight. Monsoon Season runs for sixteen rounds, opens its charters in rounds six and eleven, and adds Broker leaks and heavier raid pressure.

The harbor shares one forecast schedule. Each captain has a personal market and order board. Every Broker's Whisper creates one guaranteed buyer at the named port. Free and paid rumors share the available slots, while staple contracts and forecast buyers keep their places. The harbor also keeps its Tidewatch bonus and order race winner across reconnects.

Voyages already underway keep their saved rules and boards. Starting a fresh voyage uses the current balance rules.

## Runtime

The server defaults to port 2154. Set `PORT` in your shell or in `.env.local` to choose any available TCP port from 1 to 65535. Railway and Render supply their own `PORT` value. The web app, API, and Socket.IO share the selected port.

```bash
PORT=3000 npm run dev
```

With this setting, open [http://localhost:3000](http://localhost:3000).

The local SQLite file is `prisma/dev.db`. Its location is resolved from the repository root for both Prisma and the application, so there is no machine specific home directory in the runtime setup.

Set the local database location in `.env.local`.

```ini
DATABASE_URL=file:./prisma/dev.db
```

Set `DEBUG_PRISMA=1` only when query logging is needed.

## Repository hygiene

The repository keeps source code, Prisma schema, tests, public icons, and package metadata. Generated folders such as `node_modules`, `.next`, and `generated` are ignored and can be rebuilt from the scripts above. Local database files, cache files, screenshots, personal launch scripts, and machine specific paths should stay out of source control.

## Database schema

This project uses Prisma schema push as its only schema workflow. The repository does not maintain a migration history. `npm run db:push` compares `prisma/schema.prisma` with the configured SQLite database and applies the required changes without replacing existing data.

Back up a persistent production database before changing the schema. Schema push is intentional here because the existing development database predates a Prisma migration ledger.

## Project map

`server.ts` starts the shared HTTP and realtime server.

`src/app` contains the application shell and API routes.

`src/components/portmasters` contains the lobby, room interface, dialogs, and shared visual components.

`src/components/portmasters/game` contains phase views, controls, and game status panels.

`src/lib/game` contains game rules, state types, difficulty settings, guide content, and integrity validation.

`src/server/realtime.ts` owns Socket.IO authentication, presence, room coordination, and shared harbor events.

`src/server/environment.ts` resolves the shared database setting. `src/server/prepareDatabase.ts` creates the configured SQLite file and parent directory before schema push.

`prisma` contains the schema and the ignored local SQLite database created by schema push.

## Commands

`npm run dev` starts the custom development server on the configured port.

`npm run build` generates Prisma and builds the production application.

`npm run start` applies the current Prisma schema and starts the production server on the configured port.

`npm run lint` runs static checks.

`npm test` runs deterministic game rule tests and an isolated HTTP, database, room, chat, and Socket.IO integration test on port 2154.

`npm run test:unit` runs the game rule tests only.

`npm run test:integration` runs the isolated full stack integration test on port 2154. Stop the development server in this checkout first.

`npm run test:balance` simulates 5,000 voyages per difficulty using four captain strategies and verifies the affordability and profit of every opening staple trade. Pass a different seed count after `--` for a shorter or longer run.

`npm run typecheck` checks TypeScript without output files.

`npm run check` runs lint, tests, and type checking.

`npm run verify` runs every check and a production build.

`npm run db:push` applies the Prisma schema to the configured SQLite database.

`npm run db:generate` regenerates the Prisma client.

## Voyage economy

New voyages use rules version 3. The host chooses shared specialties before launch. Fair Winds opens one specialty in round four. Open Waters adds a charter specialty in round five. Monsoon Season adds charter specialties in rounds seven and eleven. Starting Gold stays at 100, 100, and 90 respectively. Base maintenance is 15, 20, and 29 Gold per round.

Choose Hemp, Silk, or Tea for the staple lot and its matching buyer. The Workshop Supplier quotes the missing inputs for one recipe each round before the final round. Artisan Management previews the next featured buyer and allows one personal workshop contract for the following round. The Clearance Buyer accepts up to two units of one finished good each round and pays Gold without awarding Reputation. The Shipyard reserves Income Tax before upgrades and applies module changes to the following round’s tax. Broker rumors retain a one to one link with their buyers.

A voyage already underway finishes with its saved rules. Host selection, shared forecasts, workshop commitments, revealed buyer terms, and completed sales survive reconnects.

`npm run test:balance -- 5000 rebalanced` runs the revised economy on the same seeds as the existing rules. The simulation reports solvency, shortages, workshop sales, unsold goods by product, rounds spent with low liquidity, and the quoted value of Boons and modules. The quoted effect totals measure each group with the other group in place, so they can overlap. Add `advanced` after `rebalanced` to exercise mixed trading and several founding recipes, including recovery from a Gold loss in round four.

## Verification

Run the full verification suite with the command below.

```bash
npm run verify
```

The integration test creates two temporary captains in one harbor. It verifies the live roster, chat, shared forecast and rules, checkpoint recovery after reconnecting, phase readiness, persisted room data, and standings replay without a second award. It removes its temporary database after the run.

For a final visual check, register two captains in isolated browser profiles, create a public harbor, join it with the second captain, and advance both through a phase. Confirm the responsive workspace, dialogs, chat, one shared transaction, and a reload all preserve room state.

## Production

Set `DATABASE_URL` to an absolute file URL on persistent storage before starting the server. Install dependencies, build, and start with the commands below.

```bash
npm ci
npm run build
npm run start
```

Back up the SQLite database before applying schema changes. Forward WebSocket upgrades when a proxy is present. Run one application instance because realtime coordination is in memory.

## Railway

The checked in `railway.json` uses Railpack, runs the production build, starts the custom HTTP and Socket.IO server, checks `/api`, and allows fifteen seconds for graceful shutdown.

Create a Railway service from this repository and deploy it without adding startup variables. Railway supplies its internal port automatically. The local development default remains port 2154.

The service can boot without a volume by using temporary Railway storage. Attach one volume at `/data` before relying on saved accounts or rooms. When the volume is present, the application stores `portmasters.db` there automatically through `RAILWAY_VOLUME_MOUNT_PATH`. Do not configure a predeploy schema command because Railway predeploy containers cannot access volumes. Keep one replica because SQLite and realtime room coordination require one running instance.

Deploy the service, then generate a Railway domain from Public Networking. HTTP, API, and Socket.IO traffic share the port Railway assigns inside the service.

## Render

In the Render dashboard, choose **New** then **Blueprint** and connect this repository. Render reads `render.yaml` from the repository root. The Blueprint creates one paid Starter web service and a 1 GB disk mounted at `/var/data`. [Render Blueprints](https://render.com/docs/infrastructure-as-code)

Render uses Node.js 22 from `.nvmrc` and assigns the service port. The start command applies the Prisma schema to `/var/data/portmasters.db`. When `/api` reports healthy, open the service URL and sign in. HTTP and Socket.IO use the same URL. SQLite data persists across service restarts and deployments. [Render persistent disks](https://render.com/docs/disks)
