/**
 * AWS network implementation — VPC, subnets, NAT (managed or fck-nat).
 *
 * @module aws/network
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { INetwork, INetworkConfig, NatStrategy } from "../network";
import { resolveCloudTarget } from "../types";

/** AWS account ID that publishes the fck-nat community AMI. */
const FCK_NAT_AMI_OWNER = "568608671756";

/** AWS-specific network options beyond the base config. */
export interface IAwsNetworkOptions {
  /** fck-nat instance type. Default: "t4g.nano". */
  readonly fckNatInstanceType?: string;
  /** Number of AZs to use. Default: 2. */
  readonly availabilityZoneCount?: number;
}

/**
 * Create an AWS VPC with public/private subnets and optional NAT.
 *
 * @example
 * ```typescript
 * const network = createAwsNetwork("prod", {
 *   cloud: "aws",
 *   cidr: "10.0.0.0/16",
 *   natStrategy: "fck-nat",
 * });
 * ```
 */
export function createAwsNetwork(
  name: string,
  config: INetworkConfig,
  options?: IAwsNetworkOptions
): INetwork {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "aws") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const cidr = config.cidr ?? "10.0.0.0/16";
  const azCount = options?.availabilityZoneCount ?? 2;
  const natStrategy: NatStrategy = config.natStrategy ?? "managed";
  const tags = config.tags ?? {};

  const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
    cidrBlock: cidr,
    enableDnsHostnames: config.enableDnsHostnames ?? true,
    enableDnsSupport: config.enableDnsSupport ?? true,
    tags: { ...tags, Name: `${name}-vpc` },
  });

  const igw = new aws.ec2.InternetGateway(`${name}-igw`, {
    vpcId: vpc.id,
    tags: { ...tags, Name: `${name}-igw` },
  });

  const azs = aws.getAvailabilityZonesOutput({ state: "available" });
  const azNames = azs.names.apply((names) => names.slice(0, azCount));

  // Public subnets
  const publicSubnets = azNames.apply((names) =>
    names.map(
      (az, i) =>
        new aws.ec2.Subnet(`${name}-public-${i}`, {
          vpcId: vpc.id,
          cidrBlock: `${cidr.split(".").slice(0, 2).join(".")}.${i + 1}.0/24`,
          availabilityZone: az,
          mapPublicIpOnLaunch: true,
          tags: {
            ...tags,
            Name: `${name}-public-${az}`,
            "kubernetes.io/role/elb": "1",
          },
        })
    )
  );

  // Private subnets
  const privateSubnets = azNames.apply((names) =>
    names.map(
      (az, i) =>
        new aws.ec2.Subnet(`${name}-private-${i}`, {
          vpcId: vpc.id,
          cidrBlock: `${cidr.split(".").slice(0, 2).join(".")}.${i + 10}.0/24`,
          availabilityZone: az,
          tags: {
            ...tags,
            Name: `${name}-private-${az}`,
            "kubernetes.io/role/internal-elb": "1",
          },
        })
    )
  );

  // Public route table
  const publicRt = new aws.ec2.RouteTable(`${name}-public-rt`, {
    vpcId: vpc.id,
    routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: igw.id }],
    tags: { ...tags, Name: `${name}-public-rt` },
  });

  publicSubnets.apply((subnets) =>
    subnets.map(
      (subnet, i) =>
        new aws.ec2.RouteTableAssociation(`${name}-public-rta-${i}`, {
          subnetId: subnet.id,
          routeTableId: publicRt.id,
        })
    )
  );

  // NAT setup
  let natGatewayId: pulumi.Output<string> | undefined;

  if (natStrategy === "fck-nat") {
    natGatewayId = createFckNat(name, vpc, publicSubnets, privateSubnets, cidr, tags, options);
  } else if (natStrategy === "managed") {
    natGatewayId = createManagedNat(name, vpc, igw, publicSubnets, privateSubnets, tags);
  } else {
    // natStrategy === "none" — no NAT, private subnets have no internet
    const privateRt = new aws.ec2.RouteTable(`${name}-private-rt`, {
      vpcId: vpc.id,
      tags: { ...tags, Name: `${name}-private-rt` },
    });

    privateSubnets.apply((subnets) =>
      subnets.map(
        (subnet, i) =>
          new aws.ec2.RouteTableAssociation(`${name}-private-rta-${i}`, {
            subnetId: subnet.id,
            routeTableId: privateRt.id,
          })
      )
    );
  }

  return {
    name,
    cloud: target,
    vpcId: vpc.id,
    cidr,
    publicSubnetIds: publicSubnets.apply((s) =>
      pulumi.all(s.map((sub) => sub.id))
    ) as pulumi.Output<ReadonlyArray<string>>,
    privateSubnetIds: privateSubnets.apply((s) =>
      pulumi.all(s.map((sub) => sub.id))
    ) as pulumi.Output<ReadonlyArray<string>>,
    natGatewayId,
    nativeResource: vpc,
  };
}

function createFckNat(
  name: string,
  vpc: aws.ec2.Vpc,
  publicSubnets: pulumi.Output<aws.ec2.Subnet[]>,
  privateSubnets: pulumi.Output<aws.ec2.Subnet[]>,
  cidr: string,
  tags: Readonly<Record<string, string>>,
  options?: IAwsNetworkOptions
): pulumi.Output<string> {
  const instanceType = options?.fckNatInstanceType ?? "t4g.nano";

  const fckNatAmi = aws.ec2.getAmiOutput({
    mostRecent: true,
    owners: [FCK_NAT_AMI_OWNER],
    filters: [
      { name: "name", values: ["fck-nat-al2023-*-arm64-ebs"] },
      { name: "architecture", values: ["arm64"] },
    ],
  });

  const sg = new aws.ec2.SecurityGroup(`${name}-fck-nat-sg`, {
    namePrefix: `${name}-fck-nat`,
    vpcId: vpc.id,
    description: "fck-nat instance security group",
    ingress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: [cidr] }],
    egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
    tags: { ...tags, Name: `${name}-fck-nat-sg` },
  });

  const eni = new aws.ec2.NetworkInterface(`${name}-fck-nat-eni`, {
    subnetId: publicSubnets.apply((s) => (s[0] as aws.ec2.Subnet).id),
    securityGroups: [sg.id],
    sourceDestCheck: false,
    tags: { ...tags, Name: `${name}-fck-nat-eni` },
  });

  new aws.ec2.Eip(`${name}-fck-nat-eip`, {
    domain: "vpc",
    networkInterface: eni.id,
    tags: { ...tags, Name: `${name}-fck-nat-eip` },
  });

  const role = new aws.iam.Role(`${name}-fck-nat-role`, {
    namePrefix: `${name}-fck-nat`,
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
    inlinePolicies: [
      {
        name: "fck-nat-eni",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "ec2:AttachNetworkInterface",
                "ec2:ModifyNetworkInterfaceAttribute",
                "ec2:AssociateAddress",
                "ec2:DisassociateAddress",
              ],
              Resource: "*",
            },
          ],
        }),
      },
    ],
    tags,
  });

  const instanceProfile = new aws.iam.InstanceProfile(`${name}-fck-nat-profile`, {
    namePrefix: `${name}-fck-nat`,
    role: role.name,
  });

  const lt = new aws.ec2.LaunchTemplate(`${name}-fck-nat-lt`, {
    namePrefix: `${name}-fck-nat`,
    imageId: fckNatAmi.id,
    instanceType,
    vpcSecurityGroupIds: [sg.id],
    iamInstanceProfile: { name: instanceProfile.name },
    userData: eni.id.apply((eniId) =>
      Buffer.from(
        `#!/bin/bash\necho "eni_id=${eniId}" >> /etc/fck-nat.conf\nservice fck-nat restart\n`
      ).toString("base64")
    ),
    tagSpecifications: [
      {
        resourceType: "instance",
        tags: { ...tags, Name: `${name}-fck-nat` },
      },
    ],
    tags,
  });

  new aws.autoscaling.Group(`${name}-fck-nat-asg`, {
    name: `${name}-fck-nat-asg`,
    vpcZoneIdentifiers: [publicSubnets.apply((s) => (s[0] as aws.ec2.Subnet).id)],
    minSize: 1,
    maxSize: 1,
    desiredCapacity: 1,
    launchTemplate: { id: lt.id, version: "$Latest" },
  });

  // Private route table through fck-nat ENI
  const privateRt = new aws.ec2.RouteTable(`${name}-private-rt`, {
    vpcId: vpc.id,
    routes: [{ cidrBlock: "0.0.0.0/0", networkInterfaceId: eni.id }],
    tags: { ...tags, Name: `${name}-private-rt` },
  });

  privateSubnets.apply((subnets) =>
    subnets.map(
      (subnet, i) =>
        new aws.ec2.RouteTableAssociation(`${name}-private-rta-${i}`, {
          subnetId: subnet.id,
          routeTableId: privateRt.id,
        })
    )
  );

  return eni.id;
}

function createManagedNat(
  name: string,
  _vpc: aws.ec2.Vpc,
  igw: aws.ec2.InternetGateway,
  publicSubnets: pulumi.Output<aws.ec2.Subnet[]>,
  privateSubnets: pulumi.Output<aws.ec2.Subnet[]>,
  tags: Readonly<Record<string, string>>
): pulumi.Output<string> {
  const eip = new aws.ec2.Eip(
    `${name}-nat-eip`,
    {
      domain: "vpc",
      tags: { ...tags, Name: `${name}-nat-eip` },
    },
    { dependsOn: [igw] }
  );

  const natGw = new aws.ec2.NatGateway(`${name}-nat`, {
    allocationId: eip.id,
    subnetId: publicSubnets.apply((s) => (s[0] as aws.ec2.Subnet).id),
    tags: { ...tags, Name: `${name}-nat` },
  });

  const privateRt = new aws.ec2.RouteTable(`${name}-private-rt`, {
    vpcId: _vpc.id,
    routes: [{ cidrBlock: "0.0.0.0/0", natGatewayId: natGw.id }],
    tags: { ...tags, Name: `${name}-private-rt` },
  });

  privateSubnets.apply((subnets) =>
    subnets.map(
      (subnet, i) =>
        new aws.ec2.RouteTableAssociation(`${name}-private-rta-${i}`, {
          subnetId: subnet.id,
          routeTableId: privateRt.id,
        })
    )
  );

  return natGw.id;
}
