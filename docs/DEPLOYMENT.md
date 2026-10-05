# Deploying Jadvix CRM

Two services, two different homes:

| Piece | What it is | Where it goes | Why |
|---|---|---|---|
| `jcrm` | Next.js 16 app | **Vercel** | What Vercel is built for. |
| `jcrmbe` | Express 5 + Prisma + MongoDB | **Render / Railway / Fly.io** | A long-lived Node process. See the warning below. |
| Database | MongoDB Atlas | Atlas (M10+ or any **replica set**) | Prisma transactions need a replica set. |

> **Do not put the Express API on Vercel.** It is technically possible as a
> serverless function, but every cold start opens a new Prisma connection and
> Atlas will hit its connection cap under normal use. The API also holds a
> refresh-token cookie and runs a rate limiter with in-process state, neither of
> which survives being spread across ephemeral lambdas. Render's free web
> service runs the same `npm start` this repo already has.

---

## 1. Database — MongoDB Atlas

1. Create a cluster. **It must be a replica set**: `prisma.$transaction` is used
   in the project, team and sprint services, and a standalone mongod rejects
   transactions outright. Atlas clusters are replica sets by default; a local
   single `mongod` is not.
2. Network Access → allow your API host's egress IPs, or `0.0.0.0/0` while you
   are getting it up.
3. Copy the connection string. It must name the database:
   `mongodb+srv://USER:PASS@cluster.mongodb.net/jadvix?retryWrites=true&w=majority`

---

## 2. Backend — Render (or Railway / Fly)

**Build command**
```
npm ci && npm run build
```
`build` already runs `prisma generate` before `tsc`, so the client is generated
against the deployed schema rather than a stale one baked into the image.

**Start command**
```
npm start
```

**Environment variables**

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Turns on secure cookies and JSON logging. |
| `PORT` | provided by the host | Render sets it; do not hardcode. |
| `DATABASE_URL` | the Atlas string | |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` | |
| `JWT_REFRESH_SECRET` | a **different** `openssl rand -base64 48` | Reusing one means a refresh token is accepted as an access token. |
| `MASTER_EMAIL` | your master-portal login | |
| `MASTER_PASSWORD_HASH` | `npm run hash-master` | Never the plain password. |
| `APP_URL` | `https://your-app.vercel.app` | Used in invite links. |
| `API_URL` | `https://your-api.onrender.com` | |
| `CORS_ORIGIN` | `https://your-app.vercel.app` | Comma-separated for several. **No trailing slash** — it is compared to the browser's `Origin` header verbatim. |
| `TRUST_PROXY` | `1` | Render and Fly sit behind a proxy; without it the rate limiter sees one IP for everyone. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM` | optional | Invitations silently no-op without them. |
| `IMAGEKIT_*` | optional | Falls back to local disk, which is **ephemeral** on Render — set these if attachments must survive a restart. |

**Push the schema once, after the first deploy:**
```
npx prisma db push
```
This is what creates the new `Sprint` and `Shift` collections and the indexes.
Run it again after any schema change — MongoDB has no migration files.

---

## 3. Frontend — Vercel

1. **Import the `jcrm` repo** at vercel.com/new. Framework preset: Next.js.
   Leave build and output settings on their defaults; `next.config.ts` already
   detects Vercel and skips the `standalone` output, which is only for Docker.
2. **Environment variable** — Settings → Environment Variables:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://your-api.onrender.com/api/v1` |

   Set it for Production, Preview and Development. It is `NEXT_PUBLIC_`, so it
   is **inlined at build time** — changing it later needs a redeploy, not just
   a restart.
3. Deploy. Then go back to the backend and make sure `CORS_ORIGIN` names the
   exact Vercel domain, including any custom one you add later.

### Preview deployments

Every Vercel preview gets its own `*.vercel.app` hostname, and the API will
reject it on CORS. Either add the preview domain to `CORS_ORIGIN`, or point
previews at a staging API.

---

## 4. Order of operations

```
Atlas cluster up
  → backend deployed, env set
  → npx prisma db push
  → npm run seed          (optional: demo company + master account)
  → frontend deployed with NEXT_PUBLIC_API_URL
  → backend CORS_ORIGIN updated with the real Vercel domain
  → redeploy backend
```

---

## 5. Smoke test after deploying

1. `GET https://your-api.onrender.com/health` → `200`.
2. Open the Vercel URL, sign in as the master account.
3. Open **Clock** as a super admin — the two tabs should list the roster.
4. Open **Tasks → sprint board** (the fifth view icon) — pick a project, create
   a sprint, drag a task into it, reload. The card should still be in the lane.
5. Open DevTools → Network while loading Tasks. `tiptap` should **not** be
   fetched until you open the New Task form.

---

## What was optimised for this deploy

**Frontend**

- The rich-text **editor** (TipTap + ProseMirror, ~390 KB) was split out of
  `RichText.tsx` into `RichTextEditor.tsx`, and is now loaded through
  `next/dynamic` with `ssr: false`. The read-only `RichTextView` — used by every
  list, cell and detail panel — has no `@tiptap` import at all. Previously,
  opening Tasks downloaded the whole editor to render descriptions it only ever
  displayed.
- `output: "standalone"` is now conditional on `process.env.VERCEL`. It is a
  Docker optimisation; on Vercel it produced a second copy of the app that was
  traced, uploaded and never run.
- `optimizePackageImports: ["@react-three/drei"]` — drei is a barrel of ~200
  helpers and the Playground scene uses four. (`lucide-react` is already on
  Next's default list.)
- `poweredByHeader: false`, plus `X-Frame-Options`, `X-Content-Type-Options` and
  `Referrer-Policy` on every response.
- Three.js and the Playground scene were already behind `next/dynamic`, and
  every module in `ModuleView` is already code-split — those were left alone.

**Backend**

- `@@index([companyId, sprintId])` on Task. The sprint board reads every lane's
  task count on each render through two `groupBy` queries, and deleting a sprint
  filters the same field to release its tasks — all collection scans without it.
- `@@index([companyId, outAt])` on Shift. The open-shift lookup runs on every
  clock action and every roster read.
- The clock roster is **three flat queries joined in memory**, not one per
  person; the same for the sprint lane counts. With a hundred employees the
  per-person version would be a hundred round trips to draw one list.
