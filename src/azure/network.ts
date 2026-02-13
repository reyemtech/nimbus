/**
 * Azure VNet network implementation.
 *
 * @module azure/network
 */

import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import type { INetwork, INetworkConfig, NatStrategy } from "../network";
import { resolveCloudTarget } from "../types";

/** Azure-specific network options beyond the base config. */
export interface IAzureNetworkOptions {
  /** Resource group name. Required for Azure. */
  readonly resourceGroupName: pulumi.Input<string>;
  /** Number of subnets per type (public/private). Default: 2. */
  readonly subnetCount?: number;
}

/**
 * Create an Azure VNet with subnets and optional NAT Gateway.
 *
 * @example
 * ```typescript
 * const network = createAzureNetwork("prod", {
 *   cloud: "azure",
 *   cidr: "10.1.0.0/16",
 *   natStrategy: "managed",
 * }, { resourceGroupName: "my-rg" });
 * ```
 */
export function createAzureNetwork(
  name: string,
  config: INetworkConfig,
  options: IAzureNetworkOptions
): INetwork {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "azure") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const cidr = config.cidr ?? "10.1.0.0/16";
  const subnetCount = options.subnetCount ?? 2;
  const natStrategy: NatStrategy = config.natStrategy ?? "managed";
  const tags = config.tags ?? {};
  const rgName = options.resourceGroupName;

  const vnet = new azure.network.VirtualNetwork(`${name}-vnet`, {
    virtualNetworkName: `${name}-vnet`,
    resourceGroupName: rgName,
    addressSpace: { addressPrefixes: [cidr] },
    tags: { ...tags, Name: `${name}-vnet` },
  });

  // Public subnets
  const publicSubnets: azure.network.Subnet[] = [];
  for (let i = 0; i < subnetCount; i++) {
    publicSubnets.push(
      new azure.network.Subnet(`${name}-public-${i}`, {
        subnetName: `${name}-public-${i}`,
        resourceGroupName: rgName,
        virtualNetworkName: vnet.name,
        addressPrefix: `${cidr.split(".").slice(0, 2).join(".")}.${i + 1}.0/24`,
      })
    );
  }

  // Private subnets
  const privateSubnets: azure.network.Subnet[] = [];
  for (let i = 0; i < subnetCount; i++) {
    const subnet = new azure.network.Subnet(`${name}-private-${i}`, {
      subnetName: `${name}-private-${i}`,
      resourceGroupName: rgName,
      virtualNetworkName: vnet.name,
      addressPrefix: `${cidr.split(".").slice(0, 2).join(".")}.${i + 10}.0/24`,
    });
    privateSubnets.push(subnet);
  }

  // NSG for private subnets
  const nsg = new azure.network.NetworkSecurityGroup(`${name}-private-nsg`, {
    networkSecurityGroupName: `${name}-private-nsg`,
    resourceGroupName: rgName,
    securityRules: [
      {
        name: "AllowVNetInbound",
        priority: 100,
        direction: "Inbound",
        access: "Allow",
        protocol: "*",
        sourceAddressPrefix: "VirtualNetwork",
        sourcePortRange: "*",
        destinationAddressPrefix: "VirtualNetwork",
        destinationPortRange: "*",
      },
      {
        name: "AllowAzureLoadBalancerInbound",
        priority: 200,
        direction: "Inbound",
        access: "Allow",
        protocol: "*",
        sourceAddressPrefix: "AzureLoadBalancer",
        sourcePortRange: "*",
        destinationAddressPrefix: "*",
        destinationPortRange: "*",
      },
      {
        name: "DenyAllInbound",
        priority: 4096,
        direction: "Inbound",
        access: "Deny",
        protocol: "*",
        sourceAddressPrefix: "*",
        sourcePortRange: "*",
        destinationAddressPrefix: "*",
        destinationPortRange: "*",
      },
    ],
    tags: { ...tags, Name: `${name}-private-nsg` },
  });

  // NAT Gateway for private subnet internet access
  let natGatewayId: pulumi.Output<string> | undefined;

  if (natStrategy === "managed") {
    const natPip = new azure.network.PublicIPAddress(`${name}-nat-pip`, {
      publicIpAddressName: `${name}-nat-pip`,
      resourceGroupName: rgName,
      sku: { name: "Standard" },
      publicIPAllocationMethod: "Static",
      tags: { ...tags, Name: `${name}-nat-pip` },
    });

    const natGw = new azure.network.NatGateway(`${name}-nat`, {
      natGatewayName: `${name}-nat`,
      resourceGroupName: rgName,
      sku: { name: "Standard" },
      publicIpAddresses: [{ id: natPip.id }],
      tags: { ...tags, Name: `${name}-nat` },
    });

    natGatewayId = natGw.id;

    // Associate NAT gateway with private subnets via subnet updates
    for (let i = 0; i < privateSubnets.length; i++) {
      new azure.network.Subnet(`${name}-private-${i}-nat`, {
        subnetName: `${name}-private-${i}`,
        resourceGroupName: rgName,
        virtualNetworkName: `${name}-vnet`,
        addressPrefix: `${cidr.split(".").slice(0, 2).join(".")}.${i + 10}.0/24`,
        natGateway: { id: natGw.id },
        networkSecurityGroup: { id: nsg.id },
      });
    }
  }

  const publicSubnetIds = pulumi.all(publicSubnets.map((s) => s.id));
  const privateSubnetIds = pulumi.all(privateSubnets.map((s) => s.id));

  return {
    name,
    cloud: target,
    vpcId: vnet.id,
    cidr,
    publicSubnetIds: publicSubnetIds as pulumi.Output<ReadonlyArray<string>>,
    privateSubnetIds: privateSubnetIds as pulumi.Output<ReadonlyArray<string>>,
    natGatewayId,
    nativeResource: vnet,
  };
}
