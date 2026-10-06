# Deploying Jadvix CRM to one EC2 instance

End state: the whole CRM answers on **`http://<ELASTIC_IP>`** — app and API,
one box, one origin.

```
                     http://<ELASTIC_IP>  :80
                              │
                          ┌───▼────┐
                          │ nginx  │
                          └─┬────┬─┘
             /api/, /health │    │ everything else
                   ┌────────▼┐  ┌▼─────────┐
                   │ Express │  │ Next.js  │
                   │  :4000  │  │  :3000   │
                   └────┬────┘  └──────────┘
                        │
                 MongoDB Atlas
```

Both Node processes bind to **127.0.0.1**, so nginx is the only thing reachable
from outside. PM2 keeps them alive and brings them back after a reboot.

Everything referenced here is in the `jcrm` repo under `deploy/`:
`nginx.conf`, `jadvix-proxy-params`, `ecosystem.config.js`, `setup.sh`,
`update.sh`.

---

## Why one origin matters

This is the design decision the whole setup turns on, and it is why there is a
reverse proxy rather than just opening two ports.

Serving the app and the API from the **same origin** means:

- **The refresh cookie works.** It is `httpOnly` + `SameSite=Lax`. Lax means
  "same-site only", so splitting the two across hosts or exposing the API on
  `:4000` would either break the cookie or force `SameSite=None`, which needs
  HTTPS — which you do not have on a bare IP.
- **No CORS.** Same origin means no preflight and no allowlist to keep in step
  with the IP.
- **One port open.** 80, and nothing else.

Two consequences follow, and both are mandatory:

| Setting | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **empty string** | Makes the client call `/api/v1` relative to whatever origin served the page. Verified: with it empty the bundle contains `api/v1` and no host; left unset, `http://localhost:4000` is baked in and nothing works off your laptop. |
| `COOKIE_SECURE` | **`false`** | A `Secure` cookie is never sent over plain HTTP. With `NODE_ENV=production` the default is `true`, so leaving this out gives you a login that appears to work and then logs you out at the first token refresh, with nothing in any log. |

The empty `NEXT_PUBLIC_API_URL` has a bonus: it is origin-relative, so putting a
domain or HTTPS in front later needs **no rebuild**.

---

## 1. The AWS side

**Instance.** Ubuntu 24.04 LTS, `t3.small` or larger.

> `t3.micro` (1 GB) is not enough. `next build` alone peaks around 1.5 GB and
> will be OOM-killed. If you are stuck on micro, build elsewhere and copy
> `.next/` up, or add swap — but `t3.small` is the honest answer.

**Storage.** 20 GB gp3 minimum. Two `node_modules` trees, two builds and the
uploads directory add up.

**Elastic IP.** Allocate one and associate it with the instance. Without it the
public IP changes on every stop/start, and `APP_URL` (which invite links are
built from) would go stale.

**Security group — inbound:**

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **your IP only** | Not `0.0.0.0/0`. |
| HTTP | 80 | `0.0.0.0/0` | The CRM. |

Do **not** open 3000 or 4000. They are bound to loopback anyway; leaving them
closed is the second lock.

**MongoDB Atlas.** Create a cluster — it **must be a replica set**, because
`prisma.$transaction` is used in the company, project, team and sprint services
and a standalone `mongod` rejects transactions outright. Atlas clusters are
replica sets by default. Under Network Access, allow your Elastic IP (`/32`) —
with a fixed IP you get to write the narrow rule that Vercel could not.

---

## 2. Provision the instance

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>
```

Clone both repos into `$HOME` first — the setup script lives in one of them:

```bash
cd ~
git clone https://github.com/Fazilniyaz/jcrm.git
git clone https://github.com/Fazilniyaz/jcrmbe.git

chmod +x ~/jcrm/deploy/*.sh
~/jcrm/deploy/setup.sh
```

That installs Node 20, nginx, PM2 and a UFW rule for 22 + 80. It deliberately
touches no secrets — those are the next step, by hand.

---

## 3. Backend config and build

```bash
cd ~/jcrmbe
openssl rand -base64 48   # run twice, keep both — they must differ
npm run hash-master       # prompts; prints MASTER_PASSWORD_HASH=...
```

Then `nano ~/jcrmbe/.env`:

```ini
NODE_ENV=production
PORT=4000

DATABASE_URL=mongodb+srv://USER:PASS@cluster.mongodb.net/jadvix?retryWrites=true&w=majority

JWT_ACCESS_SECRET=<first openssl output>
JWT_REFRESH_SECRET=<second, DIFFERENT openssl output>

MASTER_EMAIL=you@yourdomain.com
MASTER_PASSWORD_HASH=$argon2id$v=19$m=65536,t=3,p=4$...

# No trailing slashes. The IP, because that is the origin people will use.
APP_URL=http://<ELASTIC_IP>
API_URL=http://<ELASTIC_IP>
CORS_ORIGIN=http://<ELASTIC_IP>

# MANDATORY on plain HTTP — see "Why one origin matters".
COOKIE_SECURE=false

# nginx sets X-Forwarded-For; this is what makes the API believe it.
TRUST_PROXY=1

# Local disk is fine here: EBS is persistent, unlike a serverless filesystem.
UPLOAD_DIR=/home/ubuntu/jadvix-uploads

# Optional. Without these, invites are logged instead of sent — and the invite
# URL comes back in the API response, which is enough to finish the flow.
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
MAIL_FROM=Jadvix <you@gmail.com>
```

```bash
chmod 600 ~/jcrmbe/.env
mkdir -p ~/jadvix-uploads

npm ci
npm run build          # runs `prisma generate`, then tsc
npx prisma db push     # creates every collection and index. Do this once.
```

`db push` is the only thing that creates the `Sprint` and `Shift` collections.
MongoDB has no migration files — **re-run it after any schema change.**

---

## 4. Frontend config and build

```bash
cd ~/jcrm
nano .env.production
```

```ini
# Empty ON PURPOSE. See "Why one origin matters" — this makes the browser call
# /api/v1 on whatever origin served the page, which nginx routes to Express.
NEXT_PUBLIC_API_URL=
```

```bash
npm ci
npm run build
```

Check it took:

```bash
grep -rc "localhost:4000" .next/static/chunks/ | grep -v ':0' && \
  echo "WRONG — .env.production was not picked up" || \
  echo "OK — no hardcoded API host in the bundle"
```

If that says WRONG, the file is misnamed or in the wrong directory. Fix it and
**rebuild** — `NEXT_PUBLIC_*` is inlined at build time, so restarting changes
nothing.

---

## 5. nginx

```bash
sudo cp ~/jcrm/deploy/jadvix-proxy-params /etc/nginx/jadvix-proxy-params
sudo cp ~/jcrm/deploy/nginx.conf /etc/nginx/sites-available/jadvix
sudo ln -sf /etc/nginx/sites-available/jadvix /etc/nginx/sites-enabled/jadvix

# The stock default site also claims `default_server` on :80 and will clash.
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` must say `syntax is ok` / `test is successful` before you reload.

---

## 6. Start both services

```bash
pm2 start ~/jcrm/deploy/ecosystem.config.js
pm2 save
pm2 startup
# It prints a `sudo env PATH=... pm2 startup systemd -u ubuntu ...` line.
# Run that line, then:
pm2 save
```

`pm2 startup` is what survives a reboot. Skipping it means the box comes back
after maintenance serving nothing but a 502.

```bash
pm2 status      # both should be `online`
pm2 logs --lines 50
```

---

## 7. Check it

```bash
curl -i http://<ELASTIC_IP>/health
# → 200, {"data":{"status":"ok",...}}      nginx → Express

curl -i http://<ELASTIC_IP>/api/v1/employees
# → 401 unauthorized                        router mounted and guarded

curl -sI http://<ELASTIC_IP>/ | head -1
# → HTTP/1.1 200 OK                         nginx → Next
```

Then in a browser at `http://<ELASTIC_IP>`:

1. Sign in to the **master portal** (`MASTER_EMAIL` + the password you hashed).
2. **Companies → Create Company.** Fill in the owner's name and email.
3. Open the invite link — emailed, or from the API response / `pm2 logs
   jadvix-api` if you did not configure Gmail. Set a password. That is the
   moment the owner and the company both go `invited` → `active`.
4. Sign in as that super admin.
5. **Leave the tab idle for 20 minutes, then click something.** If you get
   logged out, `COOKIE_SECURE=false` is missing — see §3.
6. Open **Clock** — both tabs should list the roster.
7. Open **Tasks → sprint board** (fifth view icon), create a sprint, drag a task
   in, reload. The card should stay in the lane.
8. Attach a file to a task and download it back.

---

## Deploying a change

```bash
ssh ubuntu@<ELASTIC_IP>
~/jcrm/deploy/update.sh
```

Pulls both repos, `npm ci`, rebuilds both, and `pm2 reload`s them — reload, not
restart, so the replacement is up before the old process goes away and nginx
never has nothing to talk to.

**After a schema change** the script reminds you, but it will not do it for you:

```bash
cd ~/jcrmbe && npx prisma db push && pm2 reload jadvix-api
```

**After an `.env` change:**

```bash
pm2 reload jadvix-api        # backend .env is read at startup
```

**After an `.env.production` change:** rebuild. `NEXT_PUBLIC_*` is compiled
into the bundle, so a reload alone does nothing:

```bash
cd ~/jcrm && npm run build && pm2 reload jadvix-app
```

### Day-to-day

```bash
pm2 status
pm2 logs jadvix-api --lines 100
pm2 logs jadvix-app --lines 100
pm2 restart jadvix-api            # hard restart, re-reads .env
pm2 monit                         # live CPU/memory
sudo systemctl reload nginx       # after an nginx.conf change
sudo tail -f /var/log/nginx/error.log
```

---

## When something is wrong

**502 Bad Gateway** — nginx is up, the thing behind it is not.
```bash
pm2 status                  # is it `errored` or `stopped`?
pm2 logs jadvix-api --err --lines 50
```
Most often the API exited at boot because `.env` is missing a required variable;
it validates the whole environment at startup and refuses to run on a bad one,
which is deliberate — a bad `DATABASE_URL` should stop a deploy, not surface as
an intermittent 500 an hour later.

**The page loads but every request 401s, or you are logged out constantly** —
the refresh cookie. Check `COOKIE_SECURE=false` is in `~/jcrmbe/.env` and that
you reloaded the API afterwards. In DevTools → Application → Cookies, you should
see `jadvix_refresh` with **Secure unticked** and path `/api/v1/auth`.

**Requests go to `localhost:4000`** — visible in DevTools → Network. The
frontend was built without `.env.production`. Fix it and rebuild (§4).

**Every API call 404s with a URL containing `/api/v1/api/v1`** — someone put
`/api/v1` on the end of `NEXT_PUBLIC_API_URL`. It is the **origin only**; the
client appends the path itself.

**`next build` is killed** — out of memory on too small an instance. See §1.

**Prisma: "transaction already closed" / "replica set required"** — the Atlas
cluster is not a replica set, or is unreachable. Check Network Access allows the
Elastic IP.

**Attachments 404 after an upload** — `UPLOAD_DIR` is not writable by `ubuntu`.
`mkdir -p ~/jadvix-uploads` and reload the API.

---

## Before anyone real uses this

`http://<ELASTIC_IP>` was the goal and this delivers it, but be clear-eyed about
what plain HTTP on an IP costs: **every password, access token and refresh
cookie crosses the network in the clear.** Anyone on a shared network between a
user and the instance can read them. It is fine for a demo or internal testing;
it is not fine for real employee data.

The upgrade is small and does not change anything above:

1. Point a domain's A record at the Elastic IP.
2. `sudo apt install certbot python3-nginx && sudo certbot --nginx -d crm.yourdomain.com`
3. In `~/jcrmbe/.env`: remove `COOKIE_SECURE=false`, and set `APP_URL`,
   `API_URL` and `CORS_ORIGIN` to `https://crm.yourdomain.com`.
4. `pm2 reload jadvix-api`

The frontend needs **no rebuild** — `NEXT_PUBLIC_API_URL` is empty, so it
follows whatever origin serves the page. That is the main reason it is empty
rather than the IP.
