# Single-Cloud Azure Example

Deploys a full production stack on Azure using the nimbus factory API.

## Components

- **Network** — VNet with public/private subnets, NAT Gateway, and NSG
- **Cluster** — AKS with system + spot worker pools and virtual nodes (ACI)
- **DNS** — Azure DNS Zone with A and CNAME records
- **Secrets** — Azure Key Vault with RBAC authorization
- **Platform** — Traefik, cert-manager, External DNS, Vault via Helm

## Architecture

```mermaid
graph LR
  Internet((Internet))

  subgraph Azure["Azure (canadacentral)"]
    ADNS[Azure DNS]
    KV[Key Vault]

    subgraph VNet["VNet 10.1.0.0/16"]
      NATGW[NAT Gateway]
      NSG[NSG]

      subgraph AKS["AKS v1.32"]
        SYS[System Pool]
        WORK[Worker Pool spot]
        ACI[Virtual Nodes ACI]

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
  EDNS --> ADNS
  VLT --> KV
  VNet --> NATGW --> Internet
```

## Usage

```bash
pulumi new typescript
npm install @reyemtech/nimbus @pulumi/azure-native @pulumi/kubernetes
cp index.ts your-project/index.ts
pulumi up
```
