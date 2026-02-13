# Single-Cloud AWS Example

Deploys a full production stack on AWS using the nimbus factory API.

## Components

- **Network** — VPC with public/private subnets and fck-nat (~$3/mo)
- **Cluster** — EKS with Auto Mode, system + spot worker pools
- **DNS** — Route 53 hosted zone with A and CNAME records
- **Secrets** — AWS Secrets Manager for database credentials
- **Platform** — Traefik, cert-manager, External DNS, Vault via Helm

## Architecture

```mermaid
graph LR
  Internet((Internet))

  subgraph AWS["AWS (us-east-1)"]
    R53[Route 53]
    SM[Secrets Manager]

    subgraph VPC["VPC 10.0.0.0/16"]
      NAT[fck-nat]

      subgraph EKS["EKS v1.32"]
        SYS[System Pool]
        WORK[Worker Pool spot]

        subgraph Platform["Platform Stack"]
          TRF[Traefik]
          CM[cert-manager]
          EDNS[External DNS]
          VLT[Vault]
        end
      end
    end
  end

  Internet --> TRF --> WORK
  EDNS --> R53
  VLT --> SM
  VPC --> NAT --> Internet
```

## Usage

```bash
pulumi new typescript
npm install @reyemtech/nimbus @pulumi/aws @pulumi/kubernetes
cp index.ts your-project/index.ts
pulumi up
```
