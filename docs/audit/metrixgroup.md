# MetrixGroup Infrastructure Audit

**Date:** 2026-02-13
**Cloud Provider:** Microsoft Azure
**Region:** Canada Central
**Subscription:** Azure subscription 1 (`ee72d1ea-deca-4ab3-a7c4-1e5012113e00`)
**Tenant:** Metrixgroup Inc (`metrixgroup.onmicrosoft.com`)
**IaC Tool:** None (manual Azure Portal + ArgoCD Helm deploys)
**Cluster Age:** ~162 days (~5.4 months)

---

## 1. Compute — AKS Cluster

| Property | Value |
|----------|-------|
| **Cluster Name** | MetrixCluster |
| **Location** | Canada Central |
| **Resource Group** | AI_Design_Studio |
| **Kubernetes Version** | 1.32.9 |
| **FQDN** | `metrixcluster-dns-bm3gq0p4.hcp.canadacentral.azmk8s.io` |

### Node Pools

| Pool | VM Size | Nodes | Mode | Notes |
|------|---------|-------|------|-------|
| **smallsys** | Standard_D2pds_v6 (2 vCPU, 8 GB) | 5 | System | Primary system pool |
| **smalluser** | Standard_D2pds_v6 (2 vCPU, 8 GB) | 4 | User | 2 Ready, 2 SchedulingDisabled |
| **workerpool** | Standard_D8pds_v6 (8 vCPU, 32 GB) | 1 | User | Large workloads (new) |
| **virtual-node-aci-linux** | ACI (serverless) | 1 | Virtual | Azure Container Instances |

**Total: 11 nodes** (10 VMs + 1 virtual node)

### Node Resource Usage

| Node | CPU | Memory | Status |
|------|-----|--------|--------|
| smallsys-000005 | 8% | 81% | OK |
| smallsys-000006 | 11% | 83% | High memory |
| smallsys-000008 | 7% | **90%** | **Critical memory** |
| smallsys-00000e | 6% | 73% | OK |
| smallsys-00000f | 5% | 46% | OK (newest) |
| smalluser-00000g | 6% | 68% | SchedulingDisabled |
| smalluser-00000j | 15% | 78% | OK |
| smalluser-00000m | 7% | **88%** | SchedulingDisabled |
| smalluser-00000n | 7% | 65% | SchedulingDisabled |
| workerpool-00006o | 1% | 4% | Recently provisioned |

---

## 2. Networking

### Virtual Network

| Property | Value |
|----------|-------|
| **VNet** | `AI_Design_Studio-vnet` |
| **Location** | Canada Central |
| **NSG** | `aks-agentpool-42297109-nsg` |

### Load Balancers (3 public IPs)

| Service | External IP | Ports | Purpose |
|---------|-------------|-------|---------|
| **Traefik** | 4.174.226.136 | 80, 443 | Primary ingress |
| **nginx** (app-routing) | 4.229.193.96 | 80, 443 | Secondary ingress (Azure addon) |
| **Neo4j** | 20.200.73.113 | 7474, 7473, 7687 | Graph DB (direct LB) |

### DNS — Azure DNS Zone

| Property | Value |
|----------|-------|
| **Zone** | `metrixgroup.com` |
| **Resource Group** | DefaultResourceGroup-CCA |

### Ingress Routes (Traefik)

| Service | Hostname | TLS |
|---------|----------|-----|
| Airbyte | `airbyte.metrixgroup.com` | Yes |
| Prefect | `prefect.metrixgroup.com` | Yes |
| Qdrant | `qdrant.metrixgroup.com` | Yes |
| AR Character | `ar.metrixgroup.com` | Yes |
| ArgoCD | `argocd.metrixgroup.com` | Yes |
| n8n | `n8n.metrixgroup.com` | Yes |
| n8n Webhook | `webhook.metrixgroup.com` | Yes |
| MCP Insights | `insights.metrixgroup.com` | Yes |

---

## 3. IAM & Authentication

### Azure AD (Entra ID)

| Component | Details |
|-----------|---------|
| **Tenant** | metrixgroup.onmicrosoft.com |
| **Admin** | mario.meyer@metrixgroup.com |

### Managed Identities (AKS)

| Identity | Purpose |
|----------|---------|
| `MetrixCluster-agentpool` | Node pool identity |
| `aciconnectorlinux-metrixcluster` | Virtual node (ACI) |
| `azurepolicy-metrixcluster` | Azure Policy addon |
| `azurekeyvaultsecretsprovider-metrixcluster` | Key Vault CSI driver |
| `webapprouting-metrixcluster` | Web app routing addon |

---

## 4. Storage

### Azure Storage Accounts

| Account | Location | Purpose |
|---------|----------|---------|
| `metrixai` | Central US | AI-related storage |
| `metrixbackups` | Canada Central | Database backup storage |

### Persistent Volume Claims (106 Gi total)

| PVC | Namespace | Size | Purpose |
|-----|-----------|------|---------|
| `data-n8n-postgresql-0` | default | 5 Gi | n8n PostgreSQL |
| `redis-data-argocd-redis-master-0` | default | 8 Gi | ArgoCD Redis cache |
| `airbyte-volume-db-airbyte-db-0` | data | 10 Gi | Airbyte PostgreSQL |
| `airbyte-minio-pv-claim-airbyte-minio-0` | data | 50 Gi | Airbyte MinIO |
| `qdrant-storage-qdrant-0` | data | 10 Gi | Qdrant vector DB |
| `mongodb` | mongodb | 8 Gi | MongoDB |
| `data-neo4j-0` | neo4j | 10 Gi | Neo4j graph DB |
| `traefik` | traefik | 5 Gi | Traefik ACME storage |

### Databases

#### MongoDB

| Property | Value |
|----------|-------|
| **Namespace** | mongodb |
| **Pods** | 1 |
| **Storage** | 8 Gi |
| **Companion** | Mongo Express (CrashLoopBackOff — 54 days) |

#### Neo4j

| Property | Value |
|----------|-------|
| **Namespace** | neo4j |
| **Version** | Chart 2025.12.1 |
| **Storage** | 10 Gi |
| **Access** | Direct LoadBalancer (20.200.73.113) — publicly exposed |
| **Age** | 8 days (newly deployed) |

#### PostgreSQL (n8n + Airbyte + Prefect)

| Instance | Namespace | Purpose |
|----------|-----------|---------|
| n8n-postgresql | default | n8n workflow data (5 Gi) |
| airbyte-db | data | Airbyte metadata (10 Gi) |
| prefect-postgresql | data | Prefect workflow data |

#### Qdrant

| Property | Value |
|----------|-------|
| **Namespace** | data |
| **Version** | 1.15.5 |
| **Storage** | 10 Gi |
| **Purpose** | Vector database for AI embeddings |

#### Redis

| Property | Value |
|----------|-------|
| **Namespace** | default |
| **Purpose** | ArgoCD session cache (8 Gi PVC) |

---

## 5. Secrets Management

### Azure Key Vault

| Property | Value |
|----------|-------|
| **Name** | `metrix-keyvault` |
| **Location** | Canada East |
| **K8s Integration** | Secrets Store CSI Driver + Azure Key Vault Provider |

### cert-manager

| Property | Value |
|----------|-------|
| **ClusterIssuer** | `letsencrypt` (Ready) |
| **Certificates** | 6 (n8n-tls, argocd-tls, prefect-tls, qdrant-tls, airbyte-tls, ar-character-tls) |
| **Missing TLS** | `insights.metrixgroup.com` (MCP Insights) |

---

## 6. Platform Stack

| Component | Status | Managed By | Notes |
|-----------|--------|-----------|-------|
| **Traefik** | Active | Helm (direct) | Primary ingress (4.174.226.136) |
| **ArgoCD** | Active | Helm (direct) | Manages 9 applications |
| **cert-manager** | Active | Helm (direct) | Let's Encrypt ClusterIssuer |
| **External DNS** | Active | ArgoCD | Azure DNS zone management |
| **n8n** | Active | Helm (direct) | Main + webhook + worker + MCP instances |
| **Azure App Routing** | Active | AKS addon | Secondary nginx ingress (mostly unused) |
| **Gatekeeper (OPA)** | Active | AKS addon | Policy admission control |
| **Azure Monitor** | Active | AKS addon | Prometheus metrics + Container Insights |
| **Retina** | Active | AKS addon | Network observability |

### ArgoCD Managed Applications (9 total)

| Application | Chart/Revision | Health |
|------------|----------------|--------|
| airbyte | 1.8.5 | Healthy |
| ar-character | Git `2a4027` | Healthy |
| external-dns | Digest `f24396...` | Healthy |
| mcp-insights | Git `891b75` | Healthy |
| mongodb | Digest `453e3d...` | Healthy |
| neo4j | 2025.12.1 | Healthy |
| prefect | 2025.10.9203337 | Healthy |
| prefect-worker | 2025.10.16183503 | Healthy |
| qdrant | 1.15.5 | Healthy |

**Not ArgoCD-managed:** n8n, Traefik, cert-manager (Helm-installed directly)

---

## 7. AI & Cognitive Services

| Resource | Type | Location | Purpose |
|----------|------|----------|---------|
| `Metrix` | Azure OpenAI | East US 2 | Private LLM deployment |
| `Metrix/Metrix` | OpenAI Project | East US 2 | AI Foundry project |
| `mario-*-francecentral` | CognitiveServices | France Central | Secondary AI resource |
| `metrix-ai-search` | Azure AI Search | Central US | Semantic search |

---

## 8. Data & ETL Platform

| Component | Namespace | Purpose |
|-----------|-----------|---------|
| **Airbyte** (7 pods) | data | Data ingestion/ELT |
| **Prefect** (server + worker) | data | Workflow orchestration |
| **n8n** (main, webhook, worker, MCP) | default | Workflow automation |
| **MinIO** (Airbyte internal) | data | Object storage for Airbyte (50 Gi) |
| **MCP Insights** | mcp-insights | AI tools dashboard |

---

## 9. Backup

### CronJobs (namespace: `backup`)

| Job | Schedule | Target |
|-----|----------|--------|
| `mongodb-backup` | 03:00 UTC daily | MongoDB |
| `postgres-backup` | 03:15 UTC daily | PostgreSQL databases |
| `neo4j-backup` | 03:30 UTC daily | Neo4j graph DB |
| `n8n-export` | 04:00 UTC daily | n8n workflows |
| `qdrant-backup` | 03:45 UTC daily | Qdrant vectors |

**Destination:** Azure Blob Storage (`metrixbackups` account)
**Recovery Points:** 237 (per tech DD)
**RPO:** 24 hours / **RTO:** 2 hours

---

## 10. Communication Services

| Resource | Type | Purpose |
|----------|------|---------|
| `metrixmail` | Azure Communication Services | Email sending |
| `n8n.metrixgroup.com` | Email Domain | n8n automated emails |
| `AzureManagedDomain` | Email Domain | Azure managed email |

---

## 11. Monitoring & Alerting

### Azure Monitor

| Resource | Purpose |
|----------|---------|
| Azure Monitor Account | Prometheus metrics collection |
| 2x Log Analytics Workspaces | Container logs + diagnostics |
| 6x Prometheus Recording Rule Groups | K8s/node metric recording |
| Container Insights data collection rule | Pod-level metrics/logs |

### Metric Alerts

| Alert | Target |
|-------|--------|
| `CPU Usage Percentage` | MetrixCluster |
| `Memory Working Set Percentage` | MetrixCluster |
| `AKS Node Not Ready` | Node health |
| `AKS Memory Critical` | Critical memory threshold |
| `Service Health Alert` | Azure service health |

### Action Group

| Name | Purpose |
|------|---------|
| `metrixgroup-alerts` | Alert notification target |

---

## 12. Container Registry

| Property | Value |
|----------|-------|
| **Name** | `metrix` |
| **Type** | Azure Container Registry |
| **Location** | Canada Central |
| **Purpose** | Private container images (AR Character, etc.) |

---

## 13. Managed Applications

| App | Purpose |
|-----|---------|
| `MetrixDeDup` | SharePoint deduplication tool (App Service) |
| `MetrixDeDup-plan` | App Service hosting plan |

---

## 14. Known Issues

| Issue | Severity | Detail |
|-------|----------|--------|
| **Mongo Express CrashLoopBackOff** | Medium | Both pods crash-looping 54 days (15,345+ restarts) |
| **Memory pressure on 3 nodes** | Medium | smallsys-000008 (90%), smallsys-000006 (83%), smalluser-00000m (88%) |
| **3 smalluser nodes SchedulingDisabled** | Low | Likely intentional drain |
| **Neo4j publicly exposed** | Medium | Direct LoadBalancer with no Traefik/TLS intermediary |
| **MCP Insights missing TLS cert** | Low | No cert-manager Certificate for insights.metrixgroup.com |

---

## 15. Costs

| Component | Estimated Annual Cost |
|-----------|-----------------------|
| Azure infrastructure (AKS, OpenAI, storage, networking) | ~$18,000/yr |
| Team (2.5 FTEs at ~20% tech allocation) | ~$254,000/yr |
| FutureTalks SaaS | ~$35,000/yr/seat |
| **Total tech spend (excl. general SaaS)** | **~$308,000/yr** |

---

## 16. Key Patterns for Abstraction

| Pattern | Implementation |
|---------|----------------|
| **Cluster** | AKS with system + user node pools, ACI virtual node |
| **Networking** | Azure VNet, Azure CNI, NSG |
| **Ingress** | Traefik LoadBalancer (primary) + Azure nginx addon (secondary) |
| **DNS** | External DNS → Azure DNS Zone |
| **Database** | MongoDB (Helm), Neo4j (Helm), PostgreSQL (Helm per-app), Qdrant (Helm) |
| **Cache** | Redis (ArgoCD internal) |
| **Object Storage** | MinIO (Airbyte internal) + Azure Blob (backups) |
| **Secrets** | Azure Key Vault + Secrets Store CSI Driver |
| **TLS** | cert-manager + Let's Encrypt (ClusterIssuer) |
| **Monitoring** | Azure Monitor + Container Insights + Prometheus |
| **Alerting** | Azure Metric Alerts (CPU, memory, node health) |
| **GitOps** | ArgoCD (9 apps) |
| **Backup** | CronJob-based (5 jobs) → Azure Blob Storage |
| **AI** | Azure OpenAI + Azure AI Search |
| **Container Registry** | Azure Container Registry |
| **Email** | Azure Communication Services |
| **Policy** | OPA Gatekeeper (AKS addon) |
