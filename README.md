# PortMasters 2

PortMasters 2 is a browser based multiplayer trading game set along the Silk Road. Captains share a harbor, advance through a voyage together, trade goods and Gold, operate artisan workshops, meet pirate risk, and compete for Reputation.

The application runs as one Node.js process. Its Next.js interface, API routes, and Socket.IO realtime service share the same HTTP server and the same port.

## Requirements

Use Node.js 22 and npm 11 or later. The package manager setting pins npm 11.17.0. A platform with native SQLite support is also required.

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

New voyages open with the founding catalog. Later ports rotate in new cargo and unlock more Boons and modules. Fair Winds runs for eight rounds with more buyer information. Open Waters runs for twelve rounds with more time to plan. Monsoon Season runs for sixteen rounds with higher costs, stronger raids, and possible Broker leaks.

The harbor shares a seeded schedule of port arrivals and forecast events. Markets and orders belong to each captain. Each Broker whisper reveals one distinct buyer already on the board, including the goods, quantities, port, and gross reward. The harbor retains Tidewatch, the Word on the Docks winner, and the raw purchases used by the next Harbor Pulse across restarts. Each round’s Harbor Pulse stays available to a captain who reconnects after the market opens.

An unattended voyage keeps its seats and checkpoint, including after a server restart. When a captain resumes voting, absent captains have 30 seconds to rejoin before their seats are released. Voyages already underway keep their saved rules and boards. Starting a fresh voyage uses the current balance rules.

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

The repository keeps source code, Prisma schema, tests, original artwork, and package metadata. The game renders commodity icons as SVG. The three original PNG files in `public/icons` are archived art and have no live interface references. Generated folders such as `node_modules`, `.next`, and `generated` are ignored and can be rebuilt from the scripts above. Local database files, cache files, screenshots, personal launch scripts, and machine specific paths should stay out of source control.

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

`npm run test:balance` runs the historical balance simulation for rules version 2, using 5,000 voyages per difficulty by default. For the current economy comparison, run `npm run test:balance:harbor`.

`npm run typecheck` checks TypeScript without output files.

`npm run check` runs lint, tests, and type checking.

`npm run verify` runs lint, unit tests, the server integration test, type checking, and the production build. The balance simulations have separate commands.

`npm run db:push` applies the Prisma schema to the configured SQLite database.

`npm run db:generate` regenerates the Prisma client.

## Voyage economy

New voyages use rules version 8. Fair Winds, Open Waters, and Monsoon Season begin with 100, 100, and 90 Gold before Renown and pay 15, 18, and 22 Gold in base maintenance. Captains open at ship level zero with six lots and six ordinary buyers. The founding recipes, ordinary finished good price ranges, and charter cadence come from the original economy. Later imports replace existing offers. Hosts do not select a specialty.

From round two, the local merchant posts its terms before purchases. On even rounds of Monsoon Season, the merchant requests one unit and the first purchase lot offers exactly one at its local price. Fair Winds also reveals a mixed buyer from round two. The other waters show a mixed buyer from round three. Ahead of Market Day, the harbor announces a buyer for the featured material and a second material. From round three on Fair Winds, other visiting buyers may want raw cargo or finished goods. Returning import commissions keep their product request. Open Waters and Monsoon Season announce a finished good commission outside Market Day. Signal Lantern reveals an additional finished good commission. Both reports carry forward, even if the Lantern is replaced, and the Broker reveals other buyers. The Workshop Supplier sells the missing inputs for one recipe per round before the final round. A Broker whisper reveals the terms of one distinct existing buyer, including all requested cargo. Imperial Mandates follow their own schedule.

The Port Exchange accepts all cargo at fallback prices. The first three units of a good use a higher rate each round, subject to rounding. The quote includes freight and VAT. Exchange sales earn no Reputation. Reserve the Exchange for unwanted stock or bills, and compare any resale with the original purchase cost.

Upgrade in the Shipyard to open module slots. Before the final round, each Shipyard visit allows one installation or swap. The last draft excludes modules whose effects would arrive too late. The Shipyard sets aside Income Tax before upgrades, voluntary loan repayments, and Convoy Venture contributions. A new module affects the following round's tax. Active voyages on rules versions 1 through 7 retain their saved boards, prices, and effects.

Run `npm run test:balance:harbor` to compare the playable original at commit `773df1c` with versions 4 through 8 on 150 shared seeds. The command reads the original engine from local Git history. The opening report measures what the starting hold can sell to ordinary buyers. Full voyage reports track cash, trading margins, stock before final Exchange sales, and module choices for seven solo strategies. The recovery report compares the same captain with and without a round four cash loss. It also reports how often captains survive the least valuable quarter of opening draws without this extra loss, including draws tied at the cutoff. Live multiplayer standings are covered by the integration test.

## Verification

Run the full verification suite with the command below.

```bash
npm run verify
```

The integration test creates two temporary captains and checks the live roster, chat, shared forecast and rules, phase readiness, Harbor Pulse from saved purchases, Exchange sale retry rejection, and standings replay without a second award. It also restarts the server, leaves saved voyages unattended past the departure window, and verifies that captains on each rules version can reconnect and settle. It removes its temporary database after the run.

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
