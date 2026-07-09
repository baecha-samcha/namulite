# Architecture

Wikindle is split into a browser client and a backend API. The browser never connects to MySQL directly.

## MVP 1

- Frontend: Vite, React, TypeScript
- Backend: Fastify, TypeScript, MySQL
- Authentication: HttpOnly cookie session
- Persistence: MySQL tables in `database/schema.sql`
- Custom syntax: small pure parser functions, not Markdown

MVP 2 will add IndexedDB and sync modules without changing the backend page contract.