# Production deployment

Dice deploys as one Node service: Express serves the built React client, and the same
process owns the `/ws` WebSocket endpoint and every live room. The included multi-stage
`Dockerfile` builds the monorepo and runs the server as a non-root user.

This repository owns the application image and its runtime contract. Host-wide concerns
such as DNS, TLS, reverse-proxy configuration, firewall rules, server provisioning, and
coordination with other applications belong in the separate personal infrastructure
repository.

## Runtime contract

- Run **exactly one replica**. Live room state, connections, and timers are process-local.
- Mount persistent storage at `/data` and keep `LOG_DIR=/data`. Without it, rooms cannot
  recover after a deploy or host restart.
- Route HTTPS and secure WebSockets to the same service and hostname. The client derives
  `wss://<current-host>/ws` automatically.
- Use `/health` as the health-check path.
- Keep the service always on while people may be playing. A sleeping service disconnects
  the table and may lose data if its filesystem is ephemeral.

The server accepts browser WebSockets from the same host automatically. Only set
`ALLOWED_ORIGINS` when a separately hosted frontend also needs access; its value is a
comma-separated list such as `https://example.com,https://www.example.com`.

## Container deployment

`compose.prod.yaml` builds the application, publishes container port 3001 only on the
host's loopback interface, and stores room logs in the explicitly named `dice-data` Docker
volume:

```bash
docker compose -f compose.prod.yaml up -d --build
curl http://127.0.0.1:3001/health
```

The host infrastructure must forward the public Dice hostname to `127.0.0.1:3001`.
WebSocket upgrades require no app-specific route beyond forwarding the same origin.

Deploy a later version with:

```bash
git pull --ff-only
docker compose -f compose.prod.yaml up -d --build
docker image prune -f
```

Useful diagnostics:

```bash
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs --tail=200 dice
```

## Renaming an existing deployment

The Compose project, service, container, and persistent volume are now named `dice`.
Before starting this configuration on a host that used the previous volume name, locate
that volume with `docker volume ls` and copy its room logs into `dice-data`; otherwise
Docker will start the app with an empty volume. Stop the old container first, keep the old
volume until recovery has been verified, and perform the migration using the host
infrastructure's documented volume-backup procedure.

## Managed platforms

A managed platform can build the root `Dockerfile`, attach a persistent volume at `/data`,
and terminate TLS. It must preserve the single-replica constraint and route `/ws` to the
same always-on service as the frontend.

## Release checklist

1. Run `npm run verify`, `npm audit --omit=dev`, and `npm run build`.
2. Confirm exactly one replica is running and `/data` is mounted and writable.
3. Check `https://<host>/health` returns `{"ok":true}`.
4. Complete the relevant multi-tab flow in [browser-testing.md](./browser-testing.md) on
   the deployed HTTPS URL; automated tests do not cover browser WebSocket behavior.
5. Confirm a redeploy reconnects clients and recovers an in-progress room.
6. Confirm the infrastructure repository's backup and restore procedure covers
   `dice-data`.

## Scope and risk

This is production-ready for a small, friends-scale game, not real-money gambling or an
adversarial public tournament. There are no accounts, moderation dashboard, analytics,
central database, or multi-region failover. Per ADR 004, the rolling client reports landed
dice faces, so a modified client can cheat. Do not treat chips as money or prizes without a
separate security, legal, abuse, and integrity design.
