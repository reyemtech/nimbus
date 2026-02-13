/**
 * Cross-cutting multi-cloud integration tests.
 *
 * Tests the interaction between CIDR utilities, validation,
 * cloud targets, and tags — the full multi-cloud planning workflow.
 */

import { describe, it, expect } from "vitest";
import {
  buildCidrMap,
  autoOffsetCidrs,
  validateNoOverlaps,
  cidrsOverlap,
} from "../../src/network/cidr";
import {
  validateMultiCloud,
  validateResourceName,
  isFeatureSupported,
  assertValidMultiCloud,
} from "../../src/types/validation";
import type { ResolvedCloudTarget } from "../../src/types/cloud-target";
import { resolveCloudTarget, CLOUD_PROVIDERS, DEFAULT_REGIONS } from "../../src/types/cloud-target";
import { normalizeTags, mergeWithRequiredTags } from "../../src/types/tags";
import { CloudValidationError, CidrError } from "../../src/types/errors";

describe("multi-cloud CIDR planning", () => {
  it("builds non-overlapping CIDRs for all supported clouds", () => {
    const map = buildCidrMap(["aws", "azure", "gcp"]);
    expect(Object.keys(map)).toHaveLength(3);
    expect(map["aws"]).toBeDefined();
    expect(map["azure"]).toBeDefined();
    expect(map["gcp"]).toBeDefined();

    // Verify no overlaps
    const cidrs = Object.values(map);
    expect(() => validateNoOverlaps(cidrs)).not.toThrow();
  });

  it("respects explicit CIDRs and auto-fills the rest", () => {
    const map = buildCidrMap(["aws", "azure", "gcp"], { aws: "10.100.0.0/16" });
    expect(map["aws"]).toBe("10.100.0.0/16");
    expect(map["azure"]).toBeDefined();
    expect(map["gcp"]).toBeDefined();

    // Auto-generated should not overlap with explicit
    expect(cidrsOverlap(map["aws"] as string, map["azure"] as string)).toBe(false);
    expect(cidrsOverlap(map["aws"] as string, map["gcp"] as string)).toBe(false);
  });

  it("rejects explicit CIDRs that overlap", () => {
    expect(() =>
      buildCidrMap(["aws", "azure"], {
        aws: "10.0.0.0/16",
        azure: "10.0.0.0/16",
      })
    ).toThrow(CidrError);
  });

  it("generates CIDRs compatible with VPC peering", () => {
    // Standard pattern: 10.X.0.0/16 with X incrementing
    const cidrs = autoOffsetCidrs(4);
    expect(cidrs).toEqual(["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16", "10.3.0.0/16"]);

    // None should overlap
    for (let i = 0; i < cidrs.length; i++) {
      for (let j = i + 1; j < cidrs.length; j++) {
        expect(cidrsOverlap(cidrs[i] as string, cidrs[j] as string)).toBe(false);
      }
    }
  });
});

describe("multi-cloud target resolution", () => {
  it("resolves a full multi-cloud array", () => {
    const targets = resolveCloudTarget([
      "aws",
      "azure",
      { provider: "gcp", region: "europe-west1" },
    ]);
    expect(targets).toEqual([
      { provider: "aws", region: "us-east-1" },
      { provider: "azure", region: "eastus" },
      { provider: "gcp", region: "europe-west1" },
    ]);
  });

  it("validates a multi-cloud config with resolved targets", () => {
    const targets = resolveCloudTarget(["aws", "azure"]) as ReadonlyArray<ResolvedCloudTarget>;
    const result = validateMultiCloud(targets, "my-app");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects multi-cloud config with duplicate provider+region", () => {
    const targets = [
      { provider: "aws" as const, region: "us-east-1" },
      { provider: "aws" as const, region: "us-east-1" },
    ];
    const result = validateMultiCloud(targets, "my-app");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("allows same provider in different regions", () => {
    const targets = [
      { provider: "aws" as const, region: "us-east-1" },
      { provider: "aws" as const, region: "eu-west-1" },
    ];
    const result = validateMultiCloud(targets, "my-app");
    expect(result.valid).toBe(true);
  });
});

describe("cross-cloud resource naming", () => {
  it("validates a name that works across all providers", () => {
    const name = "my-prod-cluster";
    for (const provider of CLOUD_PROVIDERS) {
      const result = validateResourceName(name, provider);
      expect(result.valid).toBe(true);
    }
  });

  it("warns about GCP restrictions for uppercase names", () => {
    const result = validateResourceName("MyProdCluster", "gcp");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("lowercase"))).toBe(true);
  });

  it("warns about Azure restrictions for special characters", () => {
    const result = validateResourceName("my_prod.cluster", "azure");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("alphanumeric"))).toBe(true);
  });

  it("rejects names too long for any provider", () => {
    const longName = "a".repeat(64);
    for (const provider of CLOUD_PROVIDERS) {
      if (provider === "rackspace") continue; // Rackspace allows 255
      const result = validateResourceName(longName, provider);
      expect(result.valid).toBe(false);
    }
  });
});

describe("cross-cloud feature compatibility", () => {
  it("managed-nat is supported on AWS and Azure", () => {
    expect(isFeatureSupported("managed-nat", "aws")).toBe(true);
    expect(isFeatureSupported("managed-nat", "azure")).toBe(true);
    expect(isFeatureSupported("managed-nat", "gcp")).toBe(true);
  });

  it("fck-nat is AWS-only", () => {
    expect(isFeatureSupported("fck-nat", "aws")).toBe(true);
    expect(isFeatureSupported("fck-nat", "azure")).toBe(false);
    expect(isFeatureSupported("fck-nat", "gcp")).toBe(false);
  });

  it("virtual-nodes is Azure-only", () => {
    expect(isFeatureSupported("virtual-nodes", "azure")).toBe(true);
    expect(isFeatureSupported("virtual-nodes", "aws")).toBe(false);
    expect(isFeatureSupported("virtual-nodes", "gcp")).toBe(false);
  });

  it("spot instances are universal", () => {
    for (const provider of CLOUD_PROVIDERS) {
      expect(isFeatureSupported("spot-instances", provider)).toBe(true);
    }
  });
});

describe("cross-cloud tag normalization", () => {
  it("normalizes tags for a multi-cloud deployment", () => {
    const baseTags = { Environment: "Production", "Cost Center": "Engineering" };

    const awsTags = normalizeTags(baseTags, "aws");
    const azureTags = normalizeTags(baseTags, "azure");
    const gcpTags = normalizeTags(baseTags, "gcp");

    // AWS and Azure preserve case
    expect(awsTags["Environment"]).toBe("Production");
    expect(azureTags["Environment"]).toBe("Production");

    // GCP lowercases everything
    expect(gcpTags["environment"]).toBe("production");
    expect(gcpTags["cost-center"]).toBe("engineering");
  });

  it("merges required tags consistently across providers", () => {
    const required = { environment: "prod", client: "acme", costCenter: "eng" };
    const merged = mergeWithRequiredTags(required, { custom: "value" });

    expect(merged.managedBy).toBe("pulumi-any-cloud");
    expect(merged.environment).toBe("prod");
    expect(merged.custom).toBe("value");
  });
});

describe("full multi-cloud validation workflow", () => {
  it("passes for a valid AWS + Azure deployment", () => {
    // Resolve targets
    const targets = resolveCloudTarget([
      "aws",
      { provider: "azure", region: "canadacentral" },
    ]) as ReadonlyArray<ResolvedCloudTarget>;

    // Validate config
    const result = validateMultiCloud(targets, "prod-cluster");
    expect(result.valid).toBe(true);

    // Plan CIDRs
    const cidrs = buildCidrMap(targets.map((t) => t.provider));
    expect(Object.keys(cidrs)).toHaveLength(2);
    expect(() => validateNoOverlaps(Object.values(cidrs))).not.toThrow();

    // Validate features per provider
    for (const target of targets) {
      expect(isFeatureSupported("managed-nat", target.provider)).toBe(true);
      expect(isFeatureSupported("spot-instances", target.provider)).toBe(true);
    }
  });

  it("assertValidMultiCloud throws for invalid configs", () => {
    expect(() =>
      assertValidMultiCloud(
        [
          { provider: "aws", region: "us-east-1" },
          { provider: "aws", region: "us-east-1" },
        ],
        "prod"
      )
    ).toThrow(CloudValidationError);
  });

  it("default regions cover all providers", () => {
    for (const provider of CLOUD_PROVIDERS) {
      expect(DEFAULT_REGIONS[provider]).toBeDefined();
      const target = resolveCloudTarget(provider);
      expect(target.region).toBe(DEFAULT_REGIONS[provider]);
    }
  });
});
