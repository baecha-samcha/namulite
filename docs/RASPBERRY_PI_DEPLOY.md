# Raspberry Pi Deployment

Namulite production runs the backend and MariaDB on the Raspberry Pi. MariaDB must listen only on the Pi loopback interface; do not expose port 3306 to the internet.

Do not store the real MariaDB password in Git. `backend/.env.example` intentionally leaves `DB_PASSWORD` and `SESSION_SECRET` empty. Create `backend/.env` on the Raspberry Pi and fill those values there.

## Required MariaDB Settings

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=namulite
DB_USER=namulite_app
DB_PASSWORD=<enter the real password on the Raspberry Pi only>
```

## Deployment Order

Run these commands on the Raspberry Pi, from the project directory:

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

`npm run db:verify` connects to the real MariaDB instance configured by `backend/.env`. It verifies CRUD using a temporary table and the application tables, then removes its test application data.

Windows `127.0.0.1:3306` checks are not production DB verification. On Windows, `ECONNREFUSED` is expected when MariaDB is installed only on the Raspberry Pi.

## Optional Script

After `backend/.env` has been edited on the Raspberry Pi, this script runs install, migration, verification, and build in order:

```bash
bash scripts/pi-deploy.sh
```

## MariaDB Port Safety

Check MariaDB binding on the Raspberry Pi:

```bash
sudo ss -ltnp | grep ':3306'
```

The listener should be on `127.0.0.1:3306` or `localhost:3306`, not `0.0.0.0:3306`.
