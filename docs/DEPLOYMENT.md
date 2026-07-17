# Production deployment

This app deploys as one Node service: Express serves the built React client, and the same
process owns the `/ws` WebSocket endpoint and every live room. The included multi-stage
`Dockerfile` builds the monorepo and runs the server as a non-root user.

## Non-negotiable topology

- Run **exactly one replica**. Live room state, connections, and timers are process-local.
- Mount persistent storage at `/data` and keep `LOG_DIR=/data`. Without it, rooms cannot
  recover after a deploy or host restart.
- Route HTTPS and secure WebSockets to the same service and hostname. The client derives
  `wss://<current-host>/ws` automatically.
- Use `/health` as the host's health-check path.
- Keep the service always on while people may be playing. A sleeping service disconnects
  the table and may lose its ephemeral filesystem.

The server accepts browser WebSockets from the same host automatically. Only set
`ALLOWED_ORIGINS` when a separately hosted frontend also needs access; its value is a
comma-separated list such as `https://example.com,https://www.example.com`.

## Recommended deployment: AWS Lightsail

Lightsail provides a normal Ubuntu VM with simpler bundled pricing than assembling an EC2
instance, EBS disk, public IPv4 address, and network transfer separately. Use the public
IPv4 Linux `$7/month` bundle: 1 GB RAM, 2 vCPUs, 40 GB SSD, and 2 TB transfer. The 1 GB VM
is enough to run this friends-scale app; a 2 GB swap file gives Docker builds temporary
headroom.

Use this layout so the same VM can host more projects later:

```text
Internet
  -> dice.kicesanders.com:443
  -> Caddy on the Lightsail VM
  -> 127.0.0.1:3001
  -> dice3 Docker container + persistent dice3-data volume
```

Each future project gets another loopback port and Caddy hostname, such as
`notes.kicesanders.com -> 127.0.0.1:3002`. Only Caddy exposes ports 80 and 443 publicly.

### 1. Create the VM

In the AWS Lightsail console:

1. Select the Oregon region (`us-west-2`), Linux/Unix, **OS Only**, and Ubuntu 24.04 LTS.
2. Select dual-stack networking and the `$7/month` public IPv4 plan.
3. Name the instance `personal-vps-1` and create it.
4. In **Networking**, create a static IP in the same region and attach it to the instance.
   The instance's default public IP can change after a stop/start; the static IP will not.
5. Allow TCP 80 and 443 from all IPv4 addresses. Keep TCP 22, but restrict its source to
   your current public IP when practical. Apply equivalent IPv6 rules before publishing an
   AAAA record.
6. Create an AWS Budget alert near the expected monthly total and enable MFA on the AWS
   root user.

### 2. Point DNS at it

At the domain registrar, create these records using the Lightsail static IPv4 address:

| Type | Name | Value | Purpose |
|---|---|---|---|
| A | `dice` | `<LIGHTSAIL_STATIC_IP>` | This game |
| A | `@` | `<LIGHTSAIL_STATIC_IP>` | Future homepage |
| A | `*` | `<LIGHTSAIL_STATIC_IP>` | Optional future subdomains |

The wildcard is convenient, but each hostname still needs a matching Caddy block before it
serves anything. If using Cloudflare DNS, start with the `dice` record in **DNS only** mode
while Caddy obtains the first certificate.

### 3. Install Docker and create swap

Open the browser-based SSH terminal from Lightsail and run:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Log out and reconnect once so the `docker` group change applies. Confirm with
`docker run --rm hello-world`.

### 4. Install Caddy

Still on the VM, install Caddy from its official Debian/Ubuntu repository:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

The package starts Caddy as a systemd service. Caddy automatically obtains and renews TLS
certificates, and `reverse_proxy` passes WebSocket upgrades without a separate `/ws` rule.

### 5. Deploy the app

Push this repository to a private Git host, then on the VM:

```bash
sudo mkdir -p /srv/apps
sudo chown ubuntu:ubuntu /srv/apps
cd /srv/apps
git clone <YOUR_GIT_REPOSITORY_URL> dice3
cd dice3
docker compose -f compose.prod.yaml up -d --build
curl http://127.0.0.1:3001/health

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl https://dice.kicesanders.com/health
```

If the purchased domain differs, update `deploy/Caddyfile` before copying it. The first
Docker build will take a few minutes on the small VM. Deploy later versions with:

```bash
cd /srv/apps/dice3
git pull --ff-only
docker compose -f compose.prod.yaml up -d --build
docker image prune -f
```

Useful diagnostics are `docker compose -f compose.prod.yaml ps`,
`docker compose -f compose.prod.yaml logs --tail=200 dice3`, and
`journalctl -u caddy --since '30 minutes ago'`.

### 6. Back up and maintain it

- Turn on automatic Lightsail snapshots if the extra storage charge is worthwhile. The
  Docker volume preserves rooms across app and VM restarts, but it is not an off-host backup.
- Run `sudo apt update && sudo apt upgrade` periodically and reboot when Ubuntu requests it.
- Keep domain auto-renewal, registrar MFA, AWS MFA, and billing alerts enabled.
- Do not run a second `dice3` container against the same hostname; this app intentionally
  uses one authoritative in-memory game process.

## Why Lightsail instead of EC2

Lightsail still teaches the useful VM fundamentals: SSH, Linux administration, Docker,
firewalls, static IPs, DNS, reverse proxies, TLS, logs, persistence, and backups. It hides
some AWS infrastructure assembly. Raw EC2 is the next step when the goal is learning VPCs,
security groups, IAM instance roles, EBS, load balancers, and autoscaling; those add moving
parts without helping this single-process app today.

## Managed alternatives

Railway or Render can build the root `Dockerfile`, attach a volume at `/data`, and manage
TLS for you. They require less server maintenance, but provide less Linux/AWS learning and
are less convenient for putting several unrelated small projects on one fixed monthly VM.

## Release checklist

1. Run `npm run verify`, `npm audit --omit=dev`, and `npm run build`.
2. Confirm the volume is mounted and writable, then deploy one replica.
3. Check `https://<host>/health` returns `{"ok":true}`.
4. Complete the relevant multi-tab flow in [browser-testing.md](./browser-testing.md) on
   the deployed HTTPS URL; automated tests do not cover browser WebSocket behavior.
5. Confirm a redeploy reconnects clients and recovers an in-progress room.
6. Enable domain auto-renewal, registrar MFA, and DNSSEC.

## Scope and risk

This is production-ready for a small, friends-scale game, not real-money gambling or an
adversarial public tournament. There are no accounts, moderation dashboard, analytics,
central database, or multi-region failover. Per ADR 004, the rolling client reports landed
dice faces, so a modified client can cheat. Do not treat chips as money or prizes without a
separate security, legal, abuse, and integrity design.
