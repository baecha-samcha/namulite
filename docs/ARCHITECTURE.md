# Architecture

Namulite is split into a browser client and a Fastify API. The browser never connects to MariaDB directly.

## MVP 1

- Frontend: Vite, React, TypeScript
- Backend: Node.js, Fastify, TypeScript, MariaDB through `mysql2/promise`
- Authentication: HttpOnly cookie session
- Persistence: MariaDB tables managed by numbered files in `database/migrations/`
- Custom syntax: small pure parser functions, not Markdown

MVP 2 will add IndexedDB and sync modules without changing the backend page contract.
