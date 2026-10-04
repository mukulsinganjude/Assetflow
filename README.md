# AssetFlow — Angular + TypeScript + Node/Express API

Angular 18 (standalone components) front end backed by a Node/Express REST API with
Supabase Postgres persistence, real JWT authentication, and bcrypt-hashed passwords. Role-based UI (admin / entry /
viewer), asset CRUD with edit + detail view, validated bulk CSV/Excel import, warranty
forecasting, offboarding returns, user management, and an audit log.

## Requirements

- Node.js 18.19+ or 20.11+ (Angular 18 requirement)
- npm 9+
- Supabase Postgres is the only active application database. `server/data.json` is
  read only by the one-time migration utility and is deleted only after verified upload.

## Run locally

Install dependencies once, then start the API and Angular front end together:

```powershell
cd /path/to/Assetflow
npm install
cd server
npm install
cd ..
npm run dev
```

### Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`server/supabase/schema.sql`](server/supabase/schema.sql), then
   [`server/supabase/migrations/002_relational_storage.sql`](server/supabase/migrations/002_relational_storage.sql), then
   [`server/supabase/migrations/003_recovery_sync_state.sql`](server/supabase/migrations/003_recovery_sync_state.sql). The third migration preserves recovery records and live-update revisions in relational mode.
3. Copy `.env.example` to `.env.local` in the project root. Set `SUPABASE_URL` from
   the project API settings and `SUPABASE_SERVICE_ROLE_KEY` to a server-side Secret
   API key (or legacy `service_role` key). Never use the publishable/anon key here or
   expose the secret in Angular.
4. Once the SQL migration has completed, run `cd server; npm run migrate:supabase` once.
   It merges local-only records, preserves current Supabase values for conflicting
   records, combines asset histories/comments, archives the exact local snapshot in
   Supabase, verifies it by reading it back, and only then removes `server/data.json`.
   If any stage fails, the local file stays in place. Then run `npm run dev`.

The backend requires Supabase and will not write application changes to local disk.
Until the relational SQL migration is applied, it can still read/write the existing
Supabase JSONB row so the site remains available during the transition.

The Supabase database is shared, but `npm run dev` still runs the API on this laptop.
For other devices to use one shared website, host the API somewhere reachable and
point the front end to that API. The API listens on port 3000 and Angular on port 4200.
Press Ctrl+C once to stop both.

Open http://localhost:4200 and log in.

### First administrator on a new database

Before the first run, set `ASSETFLOW_BOOTSTRAP_ADMIN_EMAIL` and
`ASSETFLOW_BOOTSTRAP_ADMIN_PASSWORD` in the private `.env.local` file. Use an
`@ccrn.com` address and a unique password of 12–72 characters. The first local
seed or empty Supabase initialization creates only this administrator; it does
not create public demo accounts. Keep `.env.local` private. These bootstrap
settings are used only when initializing an empty database and do not change
existing accounts. An administrator can reset a user's password in User Roles;
self-service password reset is disabled.

## Build for production

```bash
npm run build      # front end -> dist/assetflow-angular
```

Serve the built front end behind any static host and point it at the API (in
production the API and static assets are typically served from the same origin, or the
front end is configured to call the API's base URL).

Passwords are stored as bcrypt hashes in the configured database. There are no
shared demo passwords or shared password-reset answers. Set a strong
`JWT_SECRET` for production (see below).

## Security model

- **Authentication:** `POST /api/auth/login` accepts company email only and verifies the password with
  `bcrypt.compareSync` and returns a JWT (8h expiry). The token is stored client-side
  and attached as `Authorization: Bearer <token>` by an Angular HTTP interceptor.
  A `401` response clears the session and forces re-login.
- **Browser origins:** the API accepts the production Netlify site and local development origins. Set
  `ASSETFLOW_CORS_ORIGINS` to a comma-separated list if you use a custom front-end domain.
- **Authorization:** every data route under `/api/*` requires a valid token. Login is public; the legacy self-service reset endpoint is disabled.
  Write operations check role (`admin` or `entry`); destructive operations
  (delete asset, bulk delete, user management, clearing logs) require `admin`.
- **Validation & sanitization (server-side, the trust boundary):** `validation.js`
  trims/strips control characters, enforces required fields, validates category /
  department / status against allow-lists, checks date format, and rejects a warranty
  date earlier than the purchase date. Duplicate serial numbers are rejected (409).
- **XSS:** all user data is rendered through Angular interpolation (`{{ }}`), which
  auto-escapes; combined with server-side sanitization this closes the stored-XSS
  vectors from the original app.
- **JWT secret:** set `JWT_SECRET` in the server environment for production. Without
  it, a development fallback secret is used (fine for local only).

## API endpoints

Public:

- `POST /api/auth/login` — `{ email, pass }` → `{ token, user }`
- `POST /api/auth/reset` — returns `410 Gone`; contact an administrator for a password reset.

Authenticated (`Authorization: Bearer <token>`):

- `GET /api/assets`
- `GET /api/changes` — lightweight revision check for other signed-in app tabs
- `POST /api/assets` (admin/entry) · `PUT /api/assets/:id` (admin/entry) · `DELETE /api/assets/:id` (admin)
- `POST /api/assets/bulk-status` · `POST /api/assets/bulk-delete` (admin)
- `POST /api/assets/extend-warranty` · `POST /api/assets/process-return`
- `POST /api/assets/import` — validated bulk CSV/Excel rows → `{ imported, skipped, errors }`
- `GET /api/users` · `POST /api/users` (admin) · `DELETE /api/users/:username` (admin; `admin` protected)
- `GET /api/logs` · `DELETE /api/logs` (admin)

## Project structure

```
server/                  Node/Express API
  server.js              routes, auth wiring, error handling
  db.js                  Supabase persistence, seed data, audit log
  migrate-supabase.js    verified one-time local-to-Supabase merge
  supabase/migrations/   normalized tables, constraints, and RPC functions
  auth.js                JWT sign/verify, requireAuth / requireRole middleware
  validation.js          clean(), isValidDate(), validateAsset()
  package.json           pure-JS deps (express, cors, bcryptjs, jsonwebtoken)

src/
  index.html             base document + CDN libs (Tailwind, Chart.js, SheetJS, QRCode)
  main.ts                bootstrapApplication + provideRouter + provideHttpClient
  app/
    app.component.*       shell: login, forgot-password, sidebar, header, QR modal, import
    app.routes.ts         routes + guards
    guards/guards.ts      adminGuard, entryGuard (functional CanActivateFn)
    models/models.ts      Asset, User, AuditLog, SelectOption, Role
    services/
      api.service.ts      thin HttpClient wrapper (get/post/put/delete) + errorMessage()
      auth.interceptor.ts Bearer-token attach + 401 handling
      auth.service.ts     login/logout, current-user signal, session restore
      data.service.ts     signals store (assets/users/logs); mutations call API then refresh
      theme.service.ts    dark/light toggle
      ui.service.ts       QR modal state
      util.ts             pagination, badges, icons, xlsx export
    components/
      shared/custom-select.component.ts
      dashboard/  entry/  employees/  returns/  warranty/  users/  logs/
```

## Notes

- **Data lives server-side** in Supabase Postgres (not localStorage). The front
  end keeps only the JWT and the current-user object in local storage for session
  restore (`assetflow_token`, `assetflow_current_user`) plus the theme preference.
- State is reactive via Angular Signals: components read signals synchronously while
  `DataService` fetches from the API and refreshes those signals around each mutation.
- Third-party libraries (Tailwind, Chart.js, SheetJS, QRCode) load from CDN in
  `index.html` and are typed as ambient globals.
- Writes are serialized and the API waits for durable storage before responding.
- **Recovery archive:** deleted asset, employee, consumable, desk setup, Dell case, and shared-link
  records are retained for administrator restore. Restores are written to System Activity. User
  accounts and comments are intentionally not included in this recovery archive.
- **Live updates:** open tabs check for a small change revision every 20 seconds while visible and
  reload the data for the current module only after another write is detected. This works across
  users sharing one running API process; online-presence counts are held in that process's memory.
- **Backups:** Supabase provides automated daily backups on eligible paid plans;
  free projects should regularly export a private off-site backup with the Supabase
  CLI. See [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).
