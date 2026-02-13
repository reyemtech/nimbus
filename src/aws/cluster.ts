/**
 * AWS EKS cluster implementation with Auto Mode support.
 *
 * @module aws/cluster
 */

import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import type { ICluster, IClusterConfig } from "../cluster";
import type { INetwork } from "../network";
import { resolveCloudTarget } from "../types";

/** AWS-specific EKS options beyond the base config. */
export interface IEksOptions {
  /** Enable EKS Auto Mode (managed node provisioning). Default: false. */
  readonly autoMode?: boolean;
  /** EKS add-ons to install. Default: vpc-cni, coredns, kube-proxy. */
  readonly addons?: ReadonlyArray<string>;
  /** Endpoint access: "public", "private", or "both". Default: "both". */
  readonly endpointAccess?: "public" | "private" | "both";
}

const DEFAULT_ADDONS = ["vpc-cni", "coredns", "kube-proxy"];

/**
 * Create an EKS cluster with optional Auto Mode.
 *
 * @example
 * ```typescript
 * const cluster = createEksCluster("prod", {
 *   cloud: "aws",
 *   nodePools: [
 *     { name: "system", instanceType: "t4g.small", minNodes: 2, maxNodes: 3 },
 *     { name: "spot", instanceType: "t4g.medium", minNodes: 1, maxNodes: 10, spot: true },
 *   ],
 * }, network, { autoMode: true });
 * ```
 */
export function createEksCluster(
  name: string,
  config: IClusterConfig,
  network: INetwork,
  options?: IEksOptions
): ICluster {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "aws") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};
  const autoMode = options?.autoMode ?? config.autoMode ?? false;
  const addons = options?.addons ?? DEFAULT_ADDONS;
  const endpointAccess = options?.endpointAccess ?? "both";

  // EKS cluster IAM role
  const clusterRole = new aws.iam.Role(`${name}-cluster-role`, {
    namePrefix: `${name}-eks`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "eks.amazonaws.com" },
        },
      ],
    }),
    tags,
  });

  new aws.iam.RolePolicyAttachment(`${name}-cluster-policy`, {
    policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
    role: clusterRole.name,
  });

  // EKS Cluster
  const cluster = new aws.eks.Cluster(`${name}-cluster`, {
    name,
    roleArn: clusterRole.arn,
    version: config.version,
    vpcConfig: {
      subnetIds: pulumi
        .all([network.publicSubnetIds, network.privateSubnetIds])
        .apply(([pub, priv]) => [...pub, ...priv]),
      endpointPrivateAccess: endpointAccess === "private" || endpointAccess === "both",
      endpointPublicAccess: endpointAccess === "public" || endpointAccess === "both",
    },
    computeConfig: autoMode ? { enabled: true } : undefined,
    accessConfig: { authenticationMode: "API_AND_CONFIG_MAP" },
    tags: { ...tags, [`kubernetes.io/cluster/${name}`]: "owned" },
  });

  // Node pools — Auto Mode delegates to EKS, standard uses managed node groups
  const nodeGroups: aws.eks.NodeGroup[] = [];

  if (!autoMode) {
    for (const np of config.nodePools) {
      const nodeRole = createNodeRole(`${name}-${np.name}`, tags);
      nodeGroups.push(
        new aws.eks.NodeGroup(`${name}-ng-${np.name}`, {
          clusterName: cluster.name,
          nodeGroupName: `${name}-${np.name}`,
          nodeRoleArn: nodeRole.arn,
          instanceTypes: [np.instanceType],
          capacityType: np.spot ? "SPOT" : "ON_DEMAND",
          scalingConfig: {
            desiredSize: np.desiredNodes ?? np.minNodes,
            minSize: np.minNodes,
            maxSize: np.maxNodes,
          },
          subnetIds: network.privateSubnetIds as pulumi.Output<string[]>,
          labels: np.labels,
          tags: { ...tags, Name: `${name}-${np.name}` },
        })
      );
    }
  }

  const firstNodeGroup = nodeGroups[0];

  // EKS Add-ons
  for (const addon of addons) {
    new aws.eks.Addon(
      `${name}-addon-${addon}`,
      {
        clusterName: cluster.name,
        addonName: addon,
        resolveConflictsOnCreate: "OVERWRITE",
        resolveConflictsOnUpdate: "OVERWRITE",
        tags,
      },
      firstNodeGroup ? { dependsOn: [firstNodeGroup] } : undefined
    );
  }

  // K8s provider for this cluster
  const kubeconfig = pulumi
    .all([cluster.endpoint, cluster.certificateAuthority, cluster.name])
    .apply(([endpoint, ca, clusterName]) =>
      JSON.stringify({
        apiVersion: "v1",
        kind: "Config",
        clusters: [
          {
            cluster: {
              server: endpoint,
              "certificate-authority-data": ca.data,
            },
            name: clusterName,
          },
        ],
        contexts: [
          {
            context: { cluster: clusterName, user: clusterName },
            name: clusterName,
          },
        ],
        "current-context": clusterName,
        users: [
          {
            name: clusterName,
            user: {
              exec: {
                apiVersion: "client.authentication.k8s.io/v1beta1",
                command: "aws",
                args: ["eks", "get-token", "--cluster-name", clusterName],
              },
            },
          },
        ],
      })
    );

  const provider = new k8s.Provider(`${name}-k8s`, {
    kubeconfig,
  });

  return {
    name,
    cloud: target,
    endpoint: cluster.endpoint,
    kubeconfig,
    version: cluster.version,
    nodePools: config.nodePools,
    nativeResource: cluster,
    provider,
  };
}

function createNodeRole(name: string, tags: Readonly<Record<string, string>>): aws.iam.Role {
  const role = new aws.iam.Role(`${name}-node-role`, {
    namePrefix: `${name}-node`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
        },
      ],
    }),
    tags,
  });

  const policies = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  ];

  for (const policyArn of policies) {
    const shortName = policyArn.split("/").pop() ?? policyArn;
    new aws.iam.RolePolicyAttachment(`${name}-${shortName}`, {
      policyArn,
      role: role.name,
    });
  }

  return role;
}
