# Security

- Passwords are never stored in plaintext.
- Passwords are hashed with bcrypt-compatible hashing.
- Session tokens are sent as HttpOnly cookies.
- Only HMAC-SHA256 session token hashes are stored in the database.
- Authenticated page APIs use the auth middleware.
- Page reads and writes are owner-scoped in MVP 1.
- SQL queries use prepared parameters through `mysql2/promise`.
- MariaDB credentials exist only in backend environment variables.
- User wiki text is escaped before the client parser emits HTML.
- The client must not contain DB credentials or API secrets.
