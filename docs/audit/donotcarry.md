# DoNotCarry Infrastructure Audit

**Date:** 2026-02-13
**Cloud Provider:** AWS
**Region:** us-east-1
**Account ID:** 888657980245
**IaC Tool:** Terraform (partial) — EKS Auto Mode
**Engagement Status:** Paused (awaiting investment)

---

## 1. Compute — EKS Cluster

| Property | Value |
|----------|-------|
| **Service** | Amazon EKS (Auto Mode) |
| **Node OS** | Bottlerocket |
| **Nodes** | 6 worker nodes |
| **Instance Types** | 4x c6a.large (2 vCPU, 4 GB) + 2x c6g.large (2 vCPU, 4 GB ARM) |
| **EKS Cost** | $95-115/mo (control plane) |
| **IAM Roles** | EKS Auto Mode roles (cluster, node, pod identity) |

### Additional EC2 Instances

| Instance | Type | State | Purpose |
|----------|------|-------|---------|
| `donotcarry` | t2.micro | **stopped** | Legacy application server |
| `Wireguard VPN` | t4g.nano | running | VPN access |
| `production` | t3a.medium | running | Production application server |

### EKS Namespaces

| Namespace | Purpose |
|-----------|---------|
| `default` | Main application workloads |
| `traefik` | Ingress controller |
| `argocd` | GitOps deployment |
| `vault` | HashiCorp Vault |
| `cert-manager` | TLS automation |
| `external-dns` | DNS management |
| `external-secrets` | Secrets sync |
| `mariadb` | MariaDB Galera cluster |
| `redis` | Redis cache |
| `mongodb` | MongoDB |
| `graylog` | Log management |
| `actions-runner-system` | GitHub Actions self-hosted runners |
| `kube-system` | Core K8s |

---

## 2. Networking

### VPC

| Property | Value |
|----------|-------|
| **VPC ID** | vpc-13ad296e |
| **CIDR** | 172.31.0.0/16 |
| **Name** | HCV |
| **Type** | Default VPC |

### Load Balancers (4 total)

| Name | Type | Status | Purpose |
|------|------|--------|---------|
| `k8s-traefik-traefik-*` | NLB | active | Traefik K8s ingress |
| `SSH-Production` | NLB | active | SSH access to production |
| `awseb--AWSEB-*` | ALB | active | Elastic Beanstalk (legacy) |
| `WireguardUI` | ALB | active | WireGuard VPN management UI |

### DNS — Route 53

#### donotcarry.com (34 records)

| Record | Type | Purpose |
|--------|------|---------|
| `donotcarry.com` | A | Root domain |
| `www.donotcarry.com` | A | WWW redirect |
| `production.donotcarry.com` | A | Production app |
| `wireguard.donotcarry.com` | A | VPN endpoint |
| `development.internal.donotcarry.com` | A | Dev environment |
| `staging.internal.donotcarry.com` | A | Staging |
| `v2.internal.donotcarry.com` | A | V2 app |
| `preview.donotcarry.com` | CNAME | Preview environment |
| `_dmarc`, `*._domainkey` | TXT | Email authentication |
| Microsoft 365 records | Various | autodiscover, lyncdiscover, msoid, sip |

#### donotcarry.tech (28 records, infrastructure/DevOps)

| Record | Type | Purpose |
|--------|------|---------|
| `argocd.donotcarry.tech` | A/AAAA | ArgoCD GitOps UI |
| `grpc.argocd.donotcarry.tech` | A/AAAA | ArgoCD gRPC endpoint |
| `graylog.donotcarry.tech` | A/AAAA | Log management UI |
| `vault.donotcarry.tech` | A/AAAA | HashiCorp Vault |
| `grafana.donotcarry.tech` | CNAME | Grafana Cloud monitoring |
| `v2.donotcarry.tech` | A/AAAA | V2 application |
| `documentation.donotcarry.tech` | A | Static documentation site |

---

## 3. IAM & Authentication

### IAM Roles (EKS-related)

| Role | Purpose |
|------|---------|
| `AmazonEKSAutoClusterRole` | EKS Auto Mode cluster management |
| `AmazonEKSAutoNodeRole` | EKS Auto Mode node management |
| `AmazonEKSPodIdentityAmazonEBSCSIDriverRole` | EBS CSI driver (pod identity) |
| `AmazonEKSPodIdentityAmazonEFSCSIDriverRole` | EFS CSI driver (pod identity) |
| `AmazonEKSPodIdentityExternalDNSRole` | Route 53 DNS management (pod identity) |
| `AWSServiceRoleForAmazonEKS` | AWS-managed EKS service role |
| `AWSServiceRoleForAmazonEKSNodegroup` | AWS-managed node group role |
| `dnc-cluster-argocd` | ArgoCD deployment role |
| `EKS-EC2-Role` | EC2 instance role for EKS nodes |

### IAM User

| User | Purpose |
|------|---------|
| `MMeyer` | Admin user (Mario Meyer) |

---

## 4. Storage

### S3 Buckets (13 total)

| Bucket | Created | Purpose |
|--------|---------|---------|
| `donotcarry` | 2021-04-07 | Legacy/original |
| `donotcarrydevelopment` | 2023-09-28 | Dev environment assets |
| `donotcarrystaging` | 2023-07-10 | Staging assets |
| `donotcarryproduction` | 2024-03-15 | Production assets |
| `backendv2` | 2024-11-29 | Backend V2 assets |
| `dnc-app-builds` | 2024-09-16 | Application build artifacts |
| `dnc-shutdown` | 2025-03-05 | Shutdown/archive data |
| `dnclogs` | 2024-10-03 | Application logs |
| `documentation.donotcarry.tech` | 2024-11-04 | Static documentation site hosting |
| `aws-glue-assets-*` | 2024-10-07 | AWS Glue ETL assets |
| `cf-templates-*` | 2024-01-18 | CloudFormation templates |
| `codepipeline-*` | 2024-09-05 | CodePipeline artifacts |
| `elasticbeanstalk-*` | 2024-08-28 | Elastic Beanstalk deployments |

### Databases

#### Aurora MySQL (RDS)

| Property | Value |
|----------|-------|
| **Cluster ID** | `dnc-production` |
| **Engine** | Aurora MySQL |
| **Instances** | 2 (primary + read replica, both db.t3.medium) |
| **Status** | Available |
| **Cost** | ~$132/mo |
| **Credential Rotation** | Auto-rotating every 7 days (RDS managed) |

#### MariaDB Galera (In-Cluster)

| Property | Value |
|----------|-------|
| **Namespace** | `mariadb` |
| **Nodes** | 3 (Galera cluster) |
| **Operator** | MariaDB Operator |

#### MongoDB (In-Cluster)

| Property | Value |
|----------|-------|
| **Namespace** | `mongodb` |
| **Operator** | MongoDB Operator |

#### Redis (In-Cluster)

| Property | Value |
|----------|-------|
| **Namespace** | `redis` |
| **Architecture** | 1 master + 3 replicas |

---

## 5. Secrets Management

### AWS Secrets Manager (5 secrets)

| Secret | Last Accessed | Purpose |
|--------|--------------|---------|
| `development` | 2025-03-04 | Dev environment credentials |
| `staging` | 2024-11-24 | Staging credentials |
| `production` | **2026-02-12** | Production credentials (active) |
| `testenv` | 2024-09-15 | Test environment |
| `rds!cluster-*` | 2024-09-29 | RDS Aurora master credentials (auto-rotate 7 days) |

**Cost observation:** $34.76/mo for 5 secrets is high (~$7/secret vs standard $0.40/secret). Likely accumulated secret versions.

### HashiCorp Vault (In-Cluster)

| Property | Value |
|----------|-------|
| **Namespace** | `vault` |
| **Endpoint** | `vault.donotcarry.tech` |

### External Secrets Operator

- Syncs secrets from Vault/AWS Secrets Manager into K8s

---

## 6. Platform Stack

| Component | Status | Notes |
|-----------|--------|-------|
| **Traefik** | Active | NLB-backed ingress controller |
| **ArgoCD** | Active | GitOps CD + gRPC endpoint |
| **HashiCorp Vault** | Active | Secrets management |
| **cert-manager** | Active | TLS automation |
| **External DNS** | Active | Route 53 management (Pod Identity) |
| **External Secrets** | Active | Vault/AWS SM sync |
| **Graylog** | Active | Centralized log management |
| **Grafana Cloud** | Active | Monitoring (CNAME to Grafana Cloud) |
| **GitHub Actions Runners** | Active | Self-hosted CI runners |

---

## 7. CI/CD

| Component | Details |
|-----------|---------|
| **GitOps** | ArgoCD |
| **CI Runners** | GitHub Actions self-hosted (actions-runner-system namespace) |
| **Legacy Pipelines** | AWS CodePipeline (S3 bucket exists) |
| **Legacy Deploy** | Elastic Beanstalk (ALB still active) |

---

## 8. Monitoring

| Component | Details |
|-----------|---------|
| **Grafana** | Grafana Cloud (external, CNAME `grafana.donotcarry.tech`) |
| **Graylog** | Self-hosted log management (`graylog.donotcarry.tech`) |
| **CloudWatch** | $47-62/mo (container insights, logs, metrics) |

---

## 9. Security

### WAF

| Property | Value |
|----------|-------|
| **Service** | AWS WAF v2 (Regional) |
| **Cost** | ~$10/mo |
| **Scope** | Regional (us-east-1) |

### VPN

| Property | Value |
|----------|-------|
| **Service** | WireGuard |
| **Instance** | t4g.nano (running) |
| **Management** | ALB-backed WireGuard UI |
| **Endpoint** | `wireguard.donotcarry.com` |

### KMS

| Property | Value |
|----------|-------|
| **Cost** | ~$5/mo |
| **Purpose** | Encryption keys (RDS, Secrets Manager, S3) |

---

## 10. Legacy / Unused Resources

| Resource | Type | Status | Notes |
|----------|------|--------|-------|
| `donotcarry` instance | EC2 t2.micro | stopped | Legacy app server |
| Elastic Beanstalk ALB | ALB | active | Legacy deploy target, still running |
| `dnc-shutdown` S3 bucket | S3 | exists | Suggests shutdown planning |
| `aws-glue-assets` S3 | S3 | exists | ETL assets (may be unused) |
| CodePipeline S3 | S3 | exists | Legacy CI pipeline |

---

## 11. Costs

### Monthly Cost Trend

| Month | Total (USD) | Change |
|-------|-------------|--------|
| November 2025 | $738.62 | — |
| December 2025 | $883.38 | +19.6% |
| January 2026 | **$1,036.84** | **+17.4%** |

### January 2026 Breakdown (services > $1)

| Service | Cost (USD) | % of Total |
|---------|-----------|------------|
| Amazon EC2 (Compute) | $366.77 | 35.4% |
| Amazon RDS (Aurora MySQL) | $131.95 | 12.7% |
| Amazon EKS | $114.68 | 11.1% |
| Amazon VPC | $100.87 | 9.7% |
| EC2 - Other (EBS, data transfer) | $71.69 | 6.9% |
| Amazon ELB | $67.16 | 6.5% |
| Tax | $64.19 | 6.2% |
| CloudWatch | $61.86 | 6.0% |
| AWS Secrets Manager | $34.76 | 3.4% |
| AWS WAF | $10.19 | 1.0% |
| Amazon S3 | $6.24 | 0.6% |
| AWS KMS | $4.94 | 0.5% |
| Amazon Route 53 | $1.06 | 0.1% |

### Cost Concerns

1. **Costs rising 40% over 3 months** ($739 → $1,037) despite engagement being paused
2. **VPC: $101/mo** — likely NAT Gateway (fck-nat alternative: ~$3/mo)
3. **Secrets Manager: $35/mo** for 5 secrets — accumulated versions
4. **EKS + 6 nodes running at full capacity** despite paused engagement
5. **Legacy Elastic Beanstalk ALB still active** — unnecessary cost

---

## 12. Key Patterns for Abstraction

| Pattern | Implementation |
|---------|----------------|
| **Cluster** | EKS Auto Mode with Bottlerocket (no explicit node groups) |
| **Networking** | Default VPC (172.31.0.0/16) — no custom VPC |
| **Ingress** | Traefik on NLB |
| **DNS** | External DNS → Route 53 (EKS Pod Identity) |
| **Database (managed)** | Aurora MySQL (db.t3.medium, 2 instances) |
| **Database (operator)** | MariaDB Galera (3-node), MongoDB Operator |
| **Cache** | Redis (1 master + 3 replicas) |
| **Secrets** | Vault + External Secrets + AWS Secrets Manager |
| **Logging** | Graylog (self-hosted) |
| **Monitoring** | Grafana Cloud (external SaaS) |
| **CI/CD** | ArgoCD + GitHub Actions self-hosted runners |
| **VPN** | WireGuard (t4g.nano) |
| **WAF** | AWS WAF v2 (Regional) |
| **Legacy** | Elastic Beanstalk, CodePipeline, CloudFormation |
