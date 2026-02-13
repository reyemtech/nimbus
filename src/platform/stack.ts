/**
 * Platform stack implementation — deploys Helm-based platform components
 * to any ICluster.
 *
 * Components: Traefik, cert-manager, External DNS, ArgoCD, Vault,
 * External Secrets Operator.
 *
 * @module platform/stack
 */

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import type { ICluster } from "../cluster";
import type {
  IExternalDnsConfig,
  IPlatformComponentConfig,
  IPlatformStack,
  IPlatformStackConfig,
  IVaultConfig,
} from "./interfaces";

/** Default Helm chart versions — pinned for reproducibility. */
const DEFAULT_VERSIONS = {
  traefik: "34.3.0",
  certManager: "v1.17.2",
  externalDns: "1.16.1",
  argocd: "7.8.26",
  vault: "0.29.1",
  externalSecrets: "0.14.4",
} as const;

/**
 * Deploy a platform stack to one or more clusters.
 *
 * Installs cloud-agnostic Helm releases for ingress, TLS, DNS, GitOps,
 * secrets management, and more. Each component can be individually
 * enabled/disabled and configured.
 *
 * @example
 * ```typescript
 * const platform = createPlatformStack("prod", {
 *   cluster,
 *   domain: "reyem.tech",
 *   externalDns: {
 *     dnsProvider: "route53",
 *     domainFilters: ["reyem.tech"],
 *   },
 *   vault: { enabled: true, ingressHost: "vault.reyem.tech" },
 * });
 * ```
 */
export function createPlatformStack(
  name: string,
  config: IPlatformStackConfig
): IPlatformStack | IPlatformStack[] {
  const clusters = Array.isArray(config.cluster) ? config.cluster : [config.cluster];

  if (clusters.length === 1) {
    return deployToCluster(name, config, clusters[0] as ICluster);
  }

  return clusters.map((cluster, i) =>
    deployToCluster(`${name}-${cluster.name || i}`, config, cluster)
  );
}

function deployToCluster(
  name: string,
  config: IPlatformStackConfig,
  cluster: ICluster
): IPlatformStack {
  const components: Record<string, k8s.helm.v3.Release> = {};
  const provider = cluster.provider;

  // 1. Traefik (ingress controller) — enabled by default
  if (config.traefik?.enabled !== false) {
    components["traefik"] = deployTraefik(name, config.traefik, provider);
  }

  // 2. cert-manager (TLS certificates) — enabled by default
  if (config.certManager?.enabled !== false) {
    components["cert-manager"] = deployCertManager(name, config.certManager, provider);
  }

  // 3. External DNS — enabled if configured
  if (config.externalDns && config.externalDns.enabled !== false) {
    components["external-dns"] = deployExternalDns(name, config.externalDns, provider);
  }

  // 4. ArgoCD (GitOps) — optional
  if (config.argocd?.enabled) {
    components["argocd"] = deployArgocd(name, config.argocd, config.domain, provider);
  }

  // 5. Vault (secrets) — optional
  if (config.vault?.enabled) {
    components["vault"] = deployVault(name, config.vault, provider);
  }

  // 6. External Secrets Operator — optional
  if (config.externalSecrets?.enabled) {
    components["external-secrets"] = deployExternalSecrets(name, config.externalSecrets, provider);
  }

  const traefikEndpoint = components["traefik"]
    ? components["traefik"].status.apply((s) => {
        const lb = s?.namespace ?? "";
        return lb;
      })
    : pulumi.output("pending");

  return {
    name,
    cluster,
    components,
    traefikEndpoint,
  };
}

function deployTraefik(
  name: string,
  config: IPlatformComponentConfig | undefined,
  provider: k8s.Provider
): k8s.helm.v3.Release {
  return new k8s.helm.v3.Release(
    `${name}-traefik`,
    {
      chart: "traefik",
      repositoryOpts: { repo: "https://traefik.github.io/charts" },
      version: config?.version ?? DEFAULT_VERSIONS.traefik,
      namespace: "traefik",
      createNamespace: true,
      values: {
        ingressRoute: {
          dashboard: { enabled: false },
        },
        ports: {
          web: { redirectTo: { port: "websecure" } },
          websecure: { tls: { enabled: true } },
        },
        providers: {
          kubernetesIngress: { publishedService: { enabled: true } },
        },
        ...config?.values,
      },
    },
    { provider }
  );
}

function deployCertManager(
  name: string,
  config: IPlatformComponentConfig | undefined,
  provider: k8s.Provider
): k8s.helm.v3.Release {
  return new k8s.helm.v3.Release(
    `${name}-cert-manager`,
    {
      chart: "cert-manager",
      repositoryOpts: { repo: "https://charts.jetstack.io" },
      version: config?.version ?? DEFAULT_VERSIONS.certManager,
      namespace: "cert-manager",
      createNamespace: true,
      values: {
        crds: { enabled: true },
        ...config?.values,
      },
    },
    { provider }
  );
}

function deployExternalDns(
  name: string,
  config: IExternalDnsConfig,
  provider: k8s.Provider
): k8s.helm.v3.Release {
  const providerValues: Record<string, unknown> = {};

  switch (config.dnsProvider) {
    case "route53":
      providerValues["provider"] = { name: "aws" };
      break;
    case "azure-dns":
      providerValues["provider"] = { name: "azure" };
      break;
    case "cloud-dns":
      providerValues["provider"] = { name: "google" };
      break;
    case "cloudflare":
      providerValues["provider"] = { name: "cloudflare" };
      break;
  }

  return new k8s.helm.v3.Release(
    `${name}-external-dns`,
    {
      chart: "external-dns",
      repositoryOpts: { repo: "https://kubernetes-sigs.github.io/external-dns" },
      version: config.version ?? DEFAULT_VERSIONS.externalDns,
      namespace: "external-dns",
      createNamespace: true,
      values: {
        ...providerValues,
        domainFilters: config.domainFilters ?? [],
        policy: "sync",
        sources: ["ingress", "service"],
        ...config.values,
      },
    },
    { provider }
  );
}

function deployArgocd(
  name: string,
  config: IPlatformComponentConfig,
  domain: string,
  provider: k8s.Provider
): k8s.helm.v3.Release {
  return new k8s.helm.v3.Release(
    `${name}-argocd`,
    {
      chart: "argo-cd",
      repositoryOpts: { repo: "https://argoproj.github.io/argo-helm" },
      version: config.version ?? DEFAULT_VERSIONS.argocd,
      namespace: "argocd",
      createNamespace: true,
      values: {
        server: {
          ingress: {
            enabled: true,
            ingressClassName: "traefik",
            hostname: `argocd.${domain}`,
            tls: true,
          },
        },
        ...config.values,
      },
    },
    { provider }
  );
}

function deployVault(
  name: string,
  config: IVaultConfig,
  provider: k8s.Provider
): k8s.helm.v3.Release {
  const ha = config.ha ?? false;
  const storageSize = config.storageSize ?? "5Gi";

  const serverValues: Record<string, unknown> = {
    standalone: { enabled: !ha },
    ha: ha
      ? {
          enabled: true,
          replicas: 3,
          raft: { enabled: true },
        }
      : { enabled: false },
    dataStorage: { size: storageSize },
  };

  if (config.ingressHost) {
    serverValues["ingress"] = {
      enabled: true,
      ingressClassName: "traefik",
      hosts: [{ host: config.ingressHost }],
      tls: [{ hosts: [config.ingressHost], secretName: "vault-tls" }],
    };
  }

  return new k8s.helm.v3.Release(
    `${name}-vault`,
    {
      chart: "vault",
      repositoryOpts: { repo: "https://helm.releases.hashicorp.com" },
      version: config.version ?? DEFAULT_VERSIONS.vault,
      namespace: "vault",
      createNamespace: true,
      values: {
        server: serverValues,
        injector: { enabled: true },
        ...config.values,
      },
    },
    { provider }
  );
}

function deployExternalSecrets(
  name: string,
  config: IPlatformComponentConfig,
  provider: k8s.Provider
): k8s.helm.v3.Release {
  return new k8s.helm.v3.Release(
    `${name}-external-secrets`,
    {
      chart: "external-secrets",
      repositoryOpts: { repo: "https://charts.external-secrets.io" },
      version: config.version ?? DEFAULT_VERSIONS.externalSecrets,
      namespace: "external-secrets",
      createNamespace: true,
      values: {
        crds: { createClusterExternalSecret: true, createClusterSecretStore: true },
        ...config.values,
      },
    },
    { provider }
  );
}
