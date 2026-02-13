/**
 * Network module — VPC/VNet provisioning abstraction.
 *
 * @module network
 */

export type { NatStrategy, ISubnetConfig, INetworkConfig, INetwork } from "./interfaces";

export {
  parseCidr,
  formatIp,
  cidrsOverlap,
  detectOverlaps,
  validateNoOverlaps,
  autoOffsetCidrs,
  buildCidrMap,
} from "./cidr";
