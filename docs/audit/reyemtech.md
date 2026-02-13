# ReyemTech Infrastructure Audit

**Date:** 2026-02-13
**Cloud Provider:** Rackspace Spot (Kubernetes) + AWS (DNS, S3, IAM)
**Region:** N/A (Rackspace) / us-east-1 (AWS)
**IaC Tool:** Terraform (HCL) — repo: `~/code/ReyemTech/cluster/`
**State Backend:** Terraform Cloud (org: `reyemtech`, workspace: `rackspace`)

---

## 1. Compute — Kubernetes Cluster

| Property | Value |
|----------|-------|
| **Provider** | Rackspace Spot |
| **Cluster Name** | ReyemCluster |
| **Nodes** | 6 (mix of instance types) |
| **CNI** | Calico |
| **CSI** | Cinder CSI (StorageClasses: `sata`, `general-hdd`) |
| **K8s Auth** | OIDC (Auth0 `login.spot.rackspace.com`) + static token fallback |

### Node Types (observed from cluster)

| Instance Type | Count | Specs |
|--------------|-------|-------|
| io1-60 | 1+ | 16 CPU, 60 GB RAM (I/O optimized) |
| memory1-30 | 1+ | 30 GB RAM (memory optimized) |
| Various | 4+ | Mixed spot instances |

### Namespaces (16 total)

| Namespace | Purpose |
|-----------|---------|
| `default` | Application services (booklet, DNC, GTA Events, Kimai, ReyemTech site) |
| `traefik` | Ingress controller + external-dns + OAuth2 proxy |
| `operators` | PXC MySQL, MinIO, External Secrets, Redis |
| `vault` | HashiCorp Vault |
| `tooling` | Typesense, Prometheus/Grafana (disabled), Loki (disabled) |
| `argocd` | ArgoCD GitOps |
| `cert-manager` | TLS certificate automation |
| `n8n` | n8n workflow automation |
| `openclaw` | OpenClaw telegram bot |
| `prefect` | Prefect workflow orchestration |
| `monitoring` | Cluster monitoring |
| `kube-system` | Core K8s services |

---

## 2. Networking

### Ingress Stack (Terraform: `traefik/traefik.tf`)

| Component | Details |
|-----------|---------|
| **Ingress Controller** | Traefik (OCI Helm chart `ghcr.io/traefik/helm/traefik`) |
| **Service Type** | LoadBalancer |
| **Ports** | 80 (→8000), 443 (→8443), 9000 (dashboard) |
| **TLS** | ACME via Route 53 DNS challenge (`myresolver`), manual DNS challenge, HTTP challenge |
| **Persistence** | 5 Gi PVC for ACME cert storage |
| **Update Strategy** | Recreate (not rolling — single replica) |
| **Access Logs** | JSON format, all headers kept |

### DNS (Terraform: `traefik/external-dns.tf`)

| Component | Details |
|-----------|---------|
| **External DNS** | Bitnami chart v6.28.5 |
| **Provider** | AWS Route 53 |
| **Policy** | `sync` (full control of DNS records) |
| **Zone** | `reyem.tech` (public) |
| **Owner ID** | `reyem-tech-external-dns` |
| **Auth** | AWS IAM credentials in K8s secret `route53-credentials` |

### Route 53 Hosted Zone (reyem.tech)

Key DNS records managed:
- `*.reyem.tech` — wildcard pointing to Traefik LB
- `track.reyem.tech` — Kimai time tracking
- `vault.reyem.tech` — HashiCorp Vault
- `minio.reyem.tech` / `storage.reyem.tech` — MinIO console/API
- `traefik.reyem.tech` — Traefik dashboard (OAuth2 protected)
- `argocd.reyem.tech` — ArgoCD

### OAuth2 Proxy (Terraform: `traefik/oauth2-proxy.tf`)

| Component | Details |
|-----------|---------|
| **Chart** | oauth2-proxy (official) |
| **Provider** | Google OAuth2 |
| **Port** | 4180 (ClusterIP) |
| **Protected Services** | Traefik dashboard |
| **Domain Whitelist** | `*.reyem.tech` |
| **Redirect URL** | `https://traefik.reyem.tech/oauth2/callback` |

---

## 3. IAM & Authentication

| Component | Mechanism |
|-----------|-----------|
| **K8s Auth** | OIDC via Auth0 (Rackspace Spot SSO) + static service account token |
| **Vault Auth** | Token-based (var.vault_token) + K8s auth for ESO |
| **DNS Auth** | AWS IAM access key (Route 53) |
| **Registry Auth** | GHCR token (GitHub Container Registry) |
| **Google OAuth** | Client ID/Secret for OAuth2 Proxy |

---

## 4. Storage

### Object Storage — MinIO (Terraform: `operators/minio.tf`)

| Property | Value |
|----------|-------|
| **Operator** | MinIO Operator (Helm chart `operator` from `operator.min.io`) |
| **Tenant** | `minio-reyemtech` |
| **Pools** | 1 pool, 2 servers, 2 volumes per server |
| **Volume Size** | 10 Gi per volume (40 Gi total) |
| **Storage Class** | `sata` |
| **Features** | SFTP enabled, auto TLS |
| **Console** | `minio.reyem.tech` |
| **API** | `storage.reyem.tech` |
| **Secrets** | Stored in Vault (`secret/operators/minio`) |

### Databases

#### PXC MySQL (Terraform: `operators/mysql.tf`)

| Property | Value |
|----------|-------|
| **Operator** | Percona PXC Operator v1.19.0 |
| **Image** | `percona/percona-xtradb-cluster:8.4.7-7.1` |
| **Cluster Size** | 3 nodes |
| **Auto Recovery** | `true` (explicit) |
| **MySQL Mode** | `pxc_strict_mode=PERMISSIVE` |
| **Resources** | Requests: 500m CPU, 2Gi RAM / Limits: 1 CPU, 4Gi RAM |
| **PVC** | 10 Gi per node (30 Gi total) |
| **HAProxy** | 2 replicas, 200m/256Mi → 500m/512Mi |
| **Backup** | Daily at 03:00 UTC to S3 (`reyem-db-backup`, `ca-central-1`), keep 7 |
| **PITR** | Enabled, S3 storage, 5-minute upload interval |
| **Passwords** | Random 16-char, stored in Vault + ExternalSecrets |

#### Redis (Terraform: `operators/redis.tf`)

| Property | Value |
|----------|-------|
| **Chart** | Bitnami Redis v20.13.3 |
| **Architecture** | Standalone master + 2 replicas |
| **Master Resources** | 100m/256Mi → 1 CPU/2Gi |
| **Persistence** | 5 Gi (master) |
| **Metrics** | Enabled |
| **Auth** | Random 16-char password, stored in Vault |

#### PostgreSQL (Terraform: `operators/pgsql.tf`)

- File exists but is empty (not currently deployed via Terraform)

### Database Provisioning (Terraform: `services/create_database/`)

- **Kubernetes Job** that runs `mysql:8` client to CREATE DATABASE, CREATE USER, GRANT PRIVILEGES
- Used for application databases (e.g., Kimai)

---

## 5. Secrets Management

### HashiCorp Vault (Terraform: `operators/vault.tf`)

| Property | Value |
|----------|-------|
| **Chart** | HashiCorp Vault (official) |
| **Namespace** | `vault` |
| **HA** | Disabled (single node) |
| **Storage** | 5 Gi PVC |
| **UI** | Enabled |
| **Ingress** | `vault.reyem.tech` via Traefik |
| **Bootstrap** | Custom script mounted from ConfigMap |

### External Secrets Operator (Terraform: `operators/external-secrets.tf`)

| Property | Value |
|----------|-------|
| **Chart** | External Secrets v0.16.1 |
| **CRDs** | Installed |
| **Webhook** | Enabled |
| **Cert Controller** | Enabled |
| **Leader Election** | Enabled |

### ClusterSecretStore

- **Backend:** Vault at `https://vault.reyem.tech`
- **Path:** `secret` (KV v2)
- **Auth:** Kubernetes auth (role: `eso`, service account: `external-secrets`)

### Secrets in Vault

| Path | Purpose |
|------|---------|
| `secret/operators/mysql` | PXC root, xtrabackup, monitor passwords |
| `secret/operators/redis` | Redis password |
| `secret/operators/minio` | MinIO access key + secret key |
| `secret/operators/s3-db-backup` | AWS S3 credentials for PXC backup |
| `secret/tooling/typesense` | Typesense API key + connection info |

---

## 6. Platform Stack

| Component | Status | Chart/Version | Notes |
|-----------|--------|--------------|-------|
| **Traefik** | Active | OCI Helm (latest) | Primary ingress, ACME via Route 53 |
| **External DNS** | Active | Bitnami v6.28.5 | Route 53 sync |
| **Vault** | Active | HashiCorp (official) | Single node, K8s auth for ESO |
| **External Secrets** | Active | v0.16.1 | Vault ClusterSecretStore |
| **OAuth2 Proxy** | Active | Official | Google auth for dashboard |
| **ArgoCD** | Active | (deployed outside Terraform) | GitOps CD |
| **cert-manager** | Active | (deployed outside Terraform) | Uses Traefik ACME resolver |
| **Prometheus** | **Disabled** (`count = 0`) | kube-prometheus-stack | Config exists but not deployed |
| **Loki** | **Disabled** (`count = 0`) | Grafana loki-stack | Config exists but not deployed |
| **K8s Dashboard** | **Disabled** (commented out) | — | Config exists but not deployed |

---

## 7. Application Services

### Kimai (Terraform: `services/kimai.tf`)

| Property | Value |
|----------|-------|
| **Purpose** | Time tracking |
| **Helm Release** | Commented out (deployed manually or via ArgoCD) |
| **Database** | MySQL (PXC) — `kimai` database, `kimai` user |
| **Hostname** | `track.reyem.tech` |
| **Grafana Integration** | MySQL datasource ConfigMap for Kimai data |
| **Export Templates** | Custom Twig templates for timesheets |

### Other Applications (deployed via ArgoCD, not in Terraform)

| Application | Namespace | Purpose |
|------------|-----------|---------|
| Booklet | default | Document/booklet service |
| DNC | default | DoNotCarry application |
| GTA Events | default | Event management (gta.events) |
| ReyemTech | default | Company website |
| n8n | n8n | Workflow automation |
| OpenClaw | openclaw | Telegram bot |
| Prefect | prefect | Data pipeline orchestration |

---

## 8. Tooling

### Typesense (Terraform: `tooling/typesense.tf`)

| Property | Value |
|----------|-------|
| **Chart** | `hmphu/typesense` |
| **Version (image)** | 28.0 |
| **Replicas** | 1 |
| **Port** | 8108 |
| **Persistence** | 5 Gi (`sata`) |
| **Secrets** | API key in Vault + ExternalSecret |

---

## 9. CI/CD

| Component | Details |
|-----------|---------|
| **GitOps** | ArgoCD (manages app deployments) |
| **IaC** | Terraform Cloud (workspace: `rackspace`) |
| **Container Registry** | GitHub Container Registry (GHCR) |

---

## 10. Monitoring

| Component | Status |
|-----------|--------|
| **Prometheus** | Defined but disabled (`count = 0`) |
| **Grafana** | Defined but disabled (`count = 0`) |
| **Loki** | Defined but disabled (`count = 0`) |
| **Redis Metrics** | Enabled (Prometheus exporter) |
| **External DNS Metrics** | Enabled |
| **Traefik Metrics** | Empty block (partially configured) |

**Gap:** No active monitoring/observability stack on ReyemCluster. Prometheus, Grafana, and Loki configs exist in Terraform but are disabled.

---

## 11. Costs

### AWS (shared account with DoNotCarry)

ReyemTech-specific AWS costs are minimal:
- **Route 53:** ~$1/mo (reyem.tech zone)
- **S3:** Portion of $6/mo (reyem-db-backup bucket)
- **IAM:** No direct cost

### Rackspace Spot

| Component | Estimated Monthly |
|-----------|------------------|
| K8s Cluster (6 nodes) | ~$150-300/mo (spot pricing varies) |
| Persistent Storage (Cinder) | ~$20-50/mo |
| **Estimated Total** | **~$200-350/mo** |

---

## 12. Key Patterns for Abstraction

| Pattern | Implementation |
|---------|----------------|
| **Secrets** | Vault → External Secrets → K8s Secret (KV v2, refresh 30m-1h) |
| **Ingress** | Traefik IngressRoute CRD → TLS via ACME DNS challenge (Route 53) |
| **DNS** | External DNS → Route 53 (sync policy) |
| **Database** | PXC Operator (Helm + CRD) → HAProxy → MySQL |
| **Cache** | Bitnami Redis Helm chart (standalone + replicas) |
| **Object Storage** | MinIO Operator (Helm + Tenant CRD) |
| **Search** | Typesense (Helm) |
| **Auth** | OAuth2 Proxy (Google) for dashboard protection |
| **Backup** | S3 scheduled backup (PXC operator native) + PITR |
| **State** | Terraform Cloud |
| **Storage Class** | `sata` (default), `general-hdd` |
