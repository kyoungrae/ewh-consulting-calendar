# API gateway preparation

This is an un-deployed Cloudflare Worker prototype. It provides `/api` over a
`workers.dev` HTTPS address and relays to the existing calendar server. The
Firebase Hosting site and the server-side database remain unchanged.

Run its local unit tests with:

```sh
node --test infra/cloudflare-api-gateway/worker.test.mjs
```

Before any production use, provide a Cloudflare account and an available
`workers.dev` subdomain; deploy and test a separate gateway; verify the
firewalled PC can reach its address; and test authentication, schedules,
updates, CORS, 12 MiB requests and error responses end to end. The current
Hosting configuration still points to the existing Tailscale URL.

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
workload before choosing this architecture.
