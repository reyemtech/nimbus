# Minimal AWS Example

Deploys a lightweight AWS stack with state management and secrets — no cluster required.

## Components

- **State Backend** — S3 bucket with versioning, encryption, and DynamoDB locking
- **Secrets** — AWS Secrets Manager for sensitive configuration

## Architecture

```mermaid
graph LR
  subgraph AWS["AWS"]
    S3[S3 State Backend]
    DDB[DynamoDB Lock Table]
    SM[Secrets Manager]
  end

  S3 --> DDB
```

## Usage

```bash
pulumi new typescript
npm install @reyemtech/nimbus @pulumi/aws
cp index.ts your-project/index.ts
pulumi up
```
