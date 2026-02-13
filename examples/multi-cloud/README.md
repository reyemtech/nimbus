# Multi-Cloud Example

Deploys an active-active stack across AWS and Azure with a Global Load Balancer.

## Components

- **Networks** — Auto-offset CIDRs (AWS: 10.0.0.0/16, Azure: 10.1.0.0/16)
- **Clusters** — EKS + AKS, same config, auto-matched to networks by provider
- **DNS** — Route 53 hosted zone
- **Platform** — Identical Helm stack deployed to both clusters
- **GLB** — Route 53 weighted routing with health checks across both clusters

## Architecture

```mermaid
graph LR
  Internet((Internet))

  subgraph GLB["Global Load Balancer"]
    R53GLB[Route 53 GLB]
    HC1[Health Check AWS]
    HC2[Health Check Azure]
  end

  subgraph AWS["AWS (us-east-1)"]
    subgraph AWSVPC["VPC 10.0.0.0/16"]
      subgraph AWSEKS["EKS v1.32"]
        AWSTRF[Traefik]
        AWSWORK[Workers spot]
        AWSEDNS[External DNS]
      end
    end
  end

  subgraph AZ["Azure (canadacentral)"]
    subgraph AZVN["VNet 10.1.0.0/16"]
      subgraph AZAKS["AKS v1.32"]
        AZTRF[Traefik]
        AZWORK[Workers spot]
        AZEDNS[External DNS]
      end
    end
  end

  DNS[Route 53 DNS]

  Internet --> R53GLB
  R53GLB --> HC1 --> AWSTRF --> AWSWORK
  R53GLB --> HC2 --> AZTRF --> AZWORK
  AWSEDNS --> DNS
  AZEDNS --> DNS
```

## How It Works

1. **Factory dispatch** — `createNetwork("prod", { cloud: ["aws", "azure"] })` creates both VPC and VNet in one call
2. **CIDR auto-offset** — Second cloud auto-increments to `10.1.0.0/16` to avoid overlaps
3. **Provider matching** — `createCluster(...)` matches each cluster to its network by provider
4. **GLB** — Route 53 weighted records distribute traffic 50/50, health checks failover automatically

## Usage

```bash
pulumi new typescript
npm install @reyemtech/nimbus @pulumi/aws @pulumi/azure-native @pulumi/kubernetes
cp index.ts your-project/index.ts
pulumi up
```
