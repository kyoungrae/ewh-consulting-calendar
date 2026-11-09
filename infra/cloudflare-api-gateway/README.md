# API gateway preparation

The Cloudflare Worker provides `/api` at
`https://ewh-calendar-api.myljk1025.workers.dev/api` and relays to the existing
calendar server through Tailscale Funnel. Firebase Hosting continues to serve
the frontend and the server-side MongoDB remains unchanged.

Run its local unit tests with:

```sh
node --test infra/cloudflare-api-gateway/worker.test.mjs
```

Before switching Hosting to the Worker, verify that the firewalled PC can reach
its address and test authentication, schedules, updates, CORS, 12 MiB requests
and error responses end to end. Keep the existing Funnel as the upstream.

The gateway signs Cloudflare's client IP for login requests using
`GATEWAY_HMAC_SECRET`. The backend verifies the signature and timestamp before
using that IP for its rate limit. Direct callers without gateway headers
continue to use their existing source-IP limit; invalid, incomplete or missing
signing configuration rejects gateway requests rather than sharing a limit.
Supply the same random secret (at least 32 characters) through
a Cloudflare Worker secret and the server's private environment; never put it
in source files or logs. Requests from other Workers are rejected on the login
endpoint to avoid trusting a forged client IP from a Worker subrequest.

**Do not switch production yet:** verify the Worker receives Cloudflare's actual
client-IP header and marks Worker subrequests as expected, verify the server is
using the same secret, and test distinct clients and tampered headers against
the running deployment. A missing or mismatched server secret rejects gateway
logins. Keep the old URL available
until these checks and login and schedule tests succeed.

Workers Free has usage limits, including a daily request limit. Exceeding them
can interrupt service; consult Cloudflare's current limits and test the upload
workload. See https://developers.cloudflare.com/workers/platform/limits/.
