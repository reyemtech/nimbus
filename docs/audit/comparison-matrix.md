# Environment Comparison Matrix

**Date:** 2026-02-13
**Purpose:** Side-by-side comparison of all 3 client environments to inform `@reyemtech/pulumi-any-cloud` interface design.

---

## Infrastructure Overview

| Dimension | ReyemTech | DoNotCarry | MetrixGroup |
|-----------|-----------|------------|-------------|
| **Cloud** | Rackspace Spot + AWS | AWS | Azure |
| **Region** | N/A / us-east-1 | us-east-1 | Canada Central |
| **IaC Tool** | Terraform (HCL) | Terraform (partial) | None (manual + ArgoCD) |
| **IaC State** | Terraform Cloud | — | — |
| **K8s Service** | Rackspace Spot K8s | EKS Auto Mode | AKS |
| **K8s Version** | (managed) | (Auto Mode) | 1.32.9 |
| **Nodes** | 6 (spot, mixed) | 6 (c6a/c6g.large) + 3 EC2 | 10 VMs + 1 virtual |
| **Monthly Cost** | ~$200-350 | ~$1,037 | ~$1,500 |

---

## Compute

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **Cluster Type** | Managed K8s (Rackspace) | EKS Auto Mode | AKS |
| **Node OS** | Linux | Bottlerocket | Linux |
| **Node Pools** | Single (spot) | Auto Mode (mixed) | 3 (smallsys, smalluser, workerpool) |
| **Spot Instances** | Yes (all) | Yes (Auto Mode) | No |
| **Virtual Nodes** | No | No | Yes (ACI) |
| **Instance Types** | io1-60, memory1-30 | c6a.large, c6g.large | D2pds_v6, D8pds_v6 |
| **Autoscaling** | No | EKS Auto Mode | AKS node autoscaler |

**Abstraction needs:**
- `ICluster` must support: managed K8s (Rackspace, EKS, AKS), spot/on-demand mix, multiple node pools, virtual nodes
- EKS Auto Mode is a special case — no explicit node groups, just node class selection

---

## Networking

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **VPC/VNet** | Rackspace managed | Default VPC (172.31.0.0/16) | AI_Design_Studio-vnet |
| **CNI** | Calico | VPC CNI (EKS) | Azure CNI |
| **NAT** | Rackspace managed | AWS NAT Gateway ($101/mo!) | Azure managed |
| **NSG/SG** | N/A | Default SG | aks-agentpool NSG |
| **Load Balancer** | Rackspace LB | NLB (4 total) | Azure LB (3 IPs) |
| **VPN** | None | WireGuard (t4g.nano) | None |

**Abstraction needs:**
- `INetwork` must handle: VPC creation (AWS), VNet (Azure), or no networking (hosted K8s like Rackspace)
- NAT Gateway abstraction with fck-nat option for AWS cost savings
- VPN optional component

---

## Ingress & DNS

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **Ingress Controller** | Traefik | Traefik | Traefik + nginx (AKS addon) |
| **TLS Provider** | ACME DNS challenge (Route 53) | ACME (method TBD) | cert-manager + Let's Encrypt |
| **DNS Provider** | AWS Route 53 | AWS Route 53 | Azure DNS Zone |
| **DNS Automation** | External DNS (Bitnami) | External DNS (Pod Identity) | External DNS (ArgoCD) |
| **DNS Zones** | reyem.tech | donotcarry.com, donotcarry.tech | metrixgroup.com |
| **OAuth/Auth** | OAuth2 Proxy (Google) | — | — |

**Abstraction needs:**
- `IDns` must support: Route 53 (AWS) and Azure DNS Zone (and eventually GCP Cloud DNS)
- Traefik is used across all 3 — this is the default ingress controller
- cert-manager vs Traefik ACME: MetrixGroup uses cert-manager, ReyemTech uses Traefik built-in ACME
- External DNS is universal — just different auth mechanisms (IAM creds vs Pod Identity vs Managed Identity)

---

## Databases

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **MySQL/MariaDB** | PXC Operator (3-node Galera) | Aurora MySQL (RDS) + MariaDB Galera (operator) | — |
| **PostgreSQL** | (empty, unused) | — | Per-app Helm (n8n, Airbyte, Prefect) |
| **MongoDB** | — | MongoDB Operator | MongoDB (Helm) |
| **Redis** | Bitnami (standalone + 2 replicas) | 1 master + 3 replicas | ArgoCD Redis only |
| **Graph DB** | — | — | Neo4j (Helm, 8 days old) |
| **Vector DB** | — | — | Qdrant 1.15.5 |
| **Search** | Typesense 28.0 | — | Azure AI Search (managed) |

**Abstraction needs:**
- `IDatabase` must support: managed (RDS Aurora, Azure Database) and operator-based (PXC, MariaDB Operator, CloudNativePG)
- `ICache` for Redis with varying architectures (standalone, master+replica, cluster)
- Graph and vector DBs may be specialized enough to skip abstraction initially
- Search: Typesense vs Azure AI Search — very different, likely leave as escape hatch

---

## Object Storage

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **In-cluster** | MinIO Operator (2 servers, 4 volumes, 40 Gi) | — | MinIO (Airbyte internal, 50 Gi) |
| **Cloud** | AWS S3 (backup bucket) | AWS S3 (13 buckets) | Azure Blob (metrixbackups) |
| **SFTP** | MinIO SFTP enabled | — | — |

**Abstraction needs:**
- `IObjectStorage` for cloud buckets (S3, Azure Blob, GCS) with lifecycle, encryption, versioning
- MinIO operator could be separate `IInClusterStorage` or just part of platform stack

---

## Secrets Management

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **Primary** | HashiCorp Vault (in-cluster) | Vault + AWS Secrets Manager | Azure Key Vault |
| **Sync** | External Secrets Operator v0.16.1 | External Secrets Operator | Secrets Store CSI Driver |
| **K8s Integration** | ESO → ClusterSecretStore → Vault | ESO → Vault + AWS SM | CSI Driver → Key Vault |
| **Vault Auth** | K8s auth (ESO role) | K8s auth | — |
| **Rotation** | None automated | RDS auto-rotate (7 days) | — |

**Abstraction needs:**
- `ISecrets` must support: HashiCorp Vault (in-cluster), AWS Secrets Manager, Azure Key Vault
- External Secrets Operator is used in 2/3 environments — should be part of platform stack
- Auto-rotation varies significantly between providers

---

## Backup

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **Strategy** | PXC native backup to S3 | RDS automated snapshots | CronJob-based (5 jobs) |
| **Schedule** | Daily 03:00 UTC, keep 7 | AWS managed | Daily 03:00-04:00 UTC |
| **PITR** | Enabled (5-min interval) | RDS native PITR | — |
| **Target** | AWS S3 (ca-central-1) | AWS managed | Azure Blob Storage |
| **Recovery Points** | 7 full + PITR | AWS managed | 237 (per DD) |

**Abstraction needs:**
- `IBackupPolicy` for scheduled backups with cloud-native destinations
- Cross-cloud restore target is a key BCDR feature

---

## Monitoring & Observability

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **Metrics** | Prometheus (disabled!) | CloudWatch ($62/mo) | Azure Monitor + Prometheus |
| **Dashboards** | Grafana (disabled!) | Grafana Cloud (SaaS) | Azure Monitor |
| **Logging** | Loki (disabled!) | Graylog (self-hosted) | Container Insights (AMA) |
| **Alerting** | None | CloudWatch Alarms | Azure Metric Alerts (4 rules) |

**Abstraction needs:**
- `IObservability` / `ObservabilityStack` for Prometheus/Grafana/Loki across all clusters
- ReyemTech has the configs but they're disabled — needs enablement
- Alert routing abstraction (Slack, PagerDuty, email)

---

## CI/CD & GitOps

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **GitOps** | ArgoCD | ArgoCD | ArgoCD |
| **CI Runners** | — | GitHub Actions (self-hosted) | — |
| **Container Registry** | GHCR (GitHub) | — | ACR (Azure) |
| **Legacy CI** | — | CodePipeline, Elastic Beanstalk | — |
| **IaC Pipeline** | Terraform Cloud | — | — |

**Abstraction needs:**
- ArgoCD is universal — part of platform stack
- Container registry varies: GHCR, ACR, ECR — consider abstraction

---

## Platform Stack Comparison

| Component | ReyemTech | DoNotCarry | MetrixGroup | Abstraction Priority |
|-----------|-----------|------------|-------------|---------------------|
| **Traefik** | ✅ | ✅ | ✅ | HIGH — universal |
| **ArgoCD** | ✅ | ✅ | ✅ | HIGH — universal |
| **cert-manager** | ✅ (indirect) | ✅ | ✅ | HIGH — universal |
| **External DNS** | ✅ | ✅ | ✅ | HIGH — universal |
| **HashiCorp Vault** | ✅ | ✅ | ❌ (Key Vault) | HIGH — 2/3 use it |
| **External Secrets** | ✅ | ✅ | ❌ (CSI) | HIGH — 2/3 use it |
| **OAuth2 Proxy** | ✅ | ❌ | ❌ | LOW — 1/3 uses it |
| **MinIO** | ✅ | ❌ | ✅ (Airbyte) | MEDIUM — 2/3 |
| **Graylog** | ❌ | ✅ | ❌ | LOW — 1/3 |
| **OPA Gatekeeper** | ❌ | ❌ | ✅ (AKS addon) | LOW — 1/3 |
| **GitHub Actions Runners** | ❌ | ✅ | ❌ | LOW — 1/3 |

---

## Security Comparison

| Feature | ReyemTech | DoNotCarry | MetrixGroup |
|---------|-----------|------------|-------------|
| **WAF** | ❌ | ✅ (AWS WAF v2) | ❌ |
| **VPN** | ❌ | ✅ (WireGuard) | ❌ |
| **Policy Engine** | ❌ | ❌ | ✅ (OPA Gatekeeper) |
| **Network Policy** | Calico (available) | VPC SG | Azure NSG |
| **Pod Identity** | ❌ | ✅ (EKS Pod Identity) | ✅ (Azure Workload Identity) |
| **TLS Everywhere** | ✅ (ACME) | ✅ (ACME) | Mostly (Neo4j gap) |

---

## Critical Findings for Interface Design

### 1. Universal Components (must abstract)
- **Kubernetes cluster** (Rackspace, EKS, AKS)
- **Traefik ingress** (all 3)
- **ArgoCD** (all 3)
- **External DNS** (all 3, different providers)
- **cert-manager** (all 3)
- **Secrets** (Vault, AWS SM, Azure KV)

### 2. Common Components (should abstract)
- **Databases** — but wildly different approaches (operator, managed, per-app Helm)
- **Redis** — used in all 3 but different scales
- **Backup** — all have some strategy but very different implementations

### 3. Cloud-Specific Components (escape hatch needed)
- **Azure OpenAI / AI Search** (MetrixGroup only)
- **AWS WAF** (DoNotCarry only)
- **WireGuard VPN** (DoNotCarry only)
- **Azure Container Instances** (MetrixGroup only)
- **AWS Elastic Beanstalk** (DoNotCarry legacy)

### 4. Key Design Observations

1. **Traefik is the standard** — all 3 use it as primary ingress. The platform stack should install Traefik by default.

2. **External DNS auth varies by cloud** — AWS uses IAM credentials (ReyemTech) or Pod Identity (DoNotCarry), Azure uses Managed Identity. The DNS abstraction must handle all three.

3. **Secrets patterns diverge** — 2/3 use Vault + ESO, 1/3 uses Azure Key Vault + CSI Driver. The abstraction should default to Vault + ESO but support native cloud secret stores as an alternative.

4. **Database approaches are heterogeneous** — operator-based (PXC, MariaDB), managed (RDS Aurora), and per-app Helm. The database abstraction needs both paths.

5. **Monitoring is the weakest link** — ReyemTech has configs but disabled, DoNotCarry uses expensive SaaS, MetrixGroup relies on Azure native. An `ObservabilityStack` would add massive value.

6. **ArgoCD manages 9 apps in MetrixGroup** — GitOps is mature there. All environments should converge on this pattern.

7. **Cost optimization opportunities:**
   - DoNotCarry NAT Gateway → fck-nat (~$97/mo savings)
   - DoNotCarry paused but running full infrastructure (~$1,037/mo)
   - DoNotCarry Secrets Manager cost (~$30/mo for 5 secrets)
   - ReyemTech monitoring stack disabled — should be enabled
