import { describe, it, expect } from "vitest";
import {
  validateFeature,
  isFeatureSupported,
  validateMultiCloud,
  validateResourceName,
  assertValidMultiCloud,
} from "../../src/types/validation";
import { CloudValidationError, UnsupportedFeatureError } from "../../src/types";

describe("validateFeature", () => {
  it("does not throw for supported features", () => {
    expect(() => validateFeature("fck-nat", "aws")).not.toThrow();
    expect(() => validateFeature("virtual-nodes", "azure")).not.toThrow();
    expect(() => validateFeature("autopilot", "gcp")).not.toThrow();
  });

  it("throws UnsupportedFeatureError for unsupported features", () => {
    expect(() => validateFeature("fck-nat", "azure")).toThrow(UnsupportedFeatureError);
    expect(() => validateFeature("virtual-nodes", "aws")).toThrow(UnsupportedFeatureError);
    expect(() => validateFeature("autopilot", "aws")).toThrow(UnsupportedFeatureError);
  });
});

describe("isFeatureSupported", () => {
  it("returns true for supported features", () => {
    expect(isFeatureSupported("managed-nat", "aws")).toBe(true);
    expect(isFeatureSupported("managed-nat", "azure")).toBe(true);
  });

  it("returns false for unsupported features", () => {
    expect(isFeatureSupported("eks-auto-mode", "azure")).toBe(false);
    expect(isFeatureSupported("azure-cni", "aws")).toBe(false);
  });
});

describe("validateResourceName", () => {
  it("accepts valid names for AWS", () => {
    const result = validateResourceName("my-cluster", "aws");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects names exceeding AWS limit", () => {
    const longName = "a".repeat(64);
    const result = validateResourceName(longName, "aws");
    expect(result.valid).toBe(false);
  });

  it("warns about Azure naming restrictions", () => {
    const result = validateResourceName("my_cluster.v2", "azure");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns about GCP uppercase", () => {
    const result = validateResourceName("MyCluster", "gcp");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects GCP names starting with non-letter", () => {
    const result = validateResourceName("123-cluster", "gcp");
    expect(result.valid).toBe(false);
  });
});

describe("validateMultiCloud", () => {
  it("accepts unique targets", () => {
    const result = validateMultiCloud(
      [
        { provider: "aws", region: "us-east-1" },
        { provider: "azure", region: "eastus" },
      ],
      "my-cluster"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate targets", () => {
    const result = validateMultiCloud(
      [
        { provider: "aws", region: "us-east-1" },
        { provider: "aws", region: "us-east-1" },
      ],
      "my-cluster"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });
});

describe("assertValidMultiCloud", () => {
  it("does not throw for valid configurations", () => {
    expect(() =>
      assertValidMultiCloud(
        [
          { provider: "aws", region: "us-east-1" },
          { provider: "azure", region: "eastus" },
        ],
        "my-cluster"
      )
    ).not.toThrow();
  });

  it("throws for invalid configurations", () => {
    expect(() =>
      assertValidMultiCloud(
        [
          { provider: "aws", region: "us-east-1" },
          { provider: "aws", region: "us-east-1" },
        ],
        "my-cluster"
      )
    ).toThrow(CloudValidationError);
  });
});
