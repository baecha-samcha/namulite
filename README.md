# Wikindle

Namulite is an offline-first personal wiki PWA inspired by Obsidian-style linking and namu.wiki-style custom syntax.

## Structure

- `frontend/`: Vite + React + TypeScript client
- `backend/`: Node.js + Fastify + TypeScript API
- `database/migrations/`: ordered MariaDB migrations
- `docs/`: architecture, API, security, and sync notes

## MVP 1 Scope

- Register, login, logout, and current-user API
- HttpOnly cookie sessions
- Password hashing with bcrypt-compatible hashing
- Page create/list/detail/update/delete/search
- MariaDB persistence through the server-side Fastify API
- Basic wiki syntax rendering: headings, `[[links]]`, bold, italic, and table of contents marker
- PWA manifest and service worker shell caching
- IndexedDB `cached_pages`, `sync_queue`, and local settings storage
- Online resume sync with `/api/sync/push` and `/api/sync/pull`
- Graph view from `page_links`, including missing-link nodes
- Canvas boards with draggable page/text cards
- Sharing roles, backlinks, revisions, and missing-link panel
- Conflict resolution, page templates, and expanded wiki syntax

## Existing Stack And Data Flow

- Language: TypeScript on both client and server
- Frontend: React 18 and Vite 5
- Backend: Node.js 20+, Fastify 5, and `mysql2/promise`
- Package manager: npm workspaces with `package-lock.json`
- Authentication: bcrypt password hashes and HttpOnly cookie sessions
- Browser storage: IndexedDB contains only offline page cache, sync queue, and local settings; localStorage contains a cached non-secret user profile
- Durable storage: the backend writes accounts, sessions, pages, revisions, links, permissions, canvases, and sync audit rows to MariaDB

The browser calls relative `/api/*` HTTP endpoints. It does not receive database credentials and never connects to MariaDB.

## Environment

On the Raspberry Pi, copy the example and then set `DB_PASSWORD` and a random `SESSION_SECRET` of at least 32 characters. Do not put the real password in Git or in Windows-local files:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Required database variables:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=namulite
DB_USER=namulite_app
DB_PASSWORD=
```

`.env` and all `.env.*` files, including `backend/.env`, are ignored by Git except `.env.example`. Never place the MariaDB password in frontend variables, source code, command arguments, logs, or committed files.

The `namulite` database and `namulite_app` user must already exist on the Raspberry Pi. The backend and MariaDB both run on the Raspberry Pi, with MariaDB bound to `127.0.0.1:3306`. Do not expose MariaDB port 3306 to the internet. The application user needs normal DDL privileges for migrations and DML privileges for runtime CRUD; it does not need permission to create databases.

## Development

Run migrations explicitly before starting the application:

```powershell
npm run db:migrate
npm run dev:backend
# In a second terminal:
npm run dev:frontend
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Offline edits are saved to IndexedDB first. When the browser returns online, pending `sync_queue` items are pushed to the backend and then server changes are pulled back into the local cache.

The backend does not create or alter tables during startup. Inspect migration state with:

```powershell
npm run db:status
```

## Verification

After migrations, run the server-side CRUD verification. It creates a temporary user and page, reads and updates the page, soft-deletes it, verifies it is no longer readable, and removes the temporary user:

```powershell
npm run db:verify
```

The database-aware health endpoint is `GET /api/health`. It returns `database: "connected"` after a successful server-side `SELECT 1`, or HTTP 503 without exposing connection details.

## Production On Raspberry Pi

```bash
git pull
cp backend/.env.example backend/.env
nano backend/.env
npm install
npm run db:migrate
npm run db:verify
npm run build
npm run start --workspace backend
```

Run `npm run db:migrate` and `npm run db:verify` on the Raspberry Pi after deployment. Windows `127.0.0.1:3306` checks are not production MariaDB verification and may fail normally when MariaDB is installed only on the Pi. Serve `frontend/dist/` with the chosen web server and proxy `/api` to `http://127.0.0.1:4000`. Set `NODE_ENV=production` and `FRONTEND_ORIGIN` to the deployed frontend origin.

## Schema

Migrations are applied in filename order from `database/migrations/`. `schema_migrations` records each filename, SHA-256 checksum, and application time. Applied files must not be edited; add a new numbered migration instead.

The schema contains:

- `users`, `sessions`
- `pages`, `page_revisions`, `page_links`, `permissions`
- `canvas_boards`, `canvas_nodes`
- `sync_log`, plus migration metadata in `schema_migrations`

Tables use InnoDB, `utf8mb4`, UUID primary keys, foreign keys, uniqueness constraints, lookup indexes, and appropriate creation/update timestamps.
