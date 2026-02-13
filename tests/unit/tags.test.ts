import { describe, it, expect, vi } from "vitest";
import { normalizeTags, isValidGcpLabel, mergeWithRequiredTags } from "../../src/types/tags";

describe("normalizeTags", () => {
  it("passes tags through for AWS", () => {
    const tags = { Environment: "Production", "Cost-Center": "Eng" };
    expect(normalizeTags(tags, "aws")).toEqual(tags);
  });

  it("passes tags through for Azure", () => {
    const tags = { Environment: "Production" };
    expect(normalizeTags(tags, "azure")).toEqual(tags);
  });

  it("passes tags through for Rackspace", () => {
    const tags = { Environment: "Production" };
    expect(normalizeTags(tags, "rackspace")).toEqual(tags);
  });

  it("returns a copy, not the original", () => {
    const tags = { foo: "bar" };
    const result = normalizeTags(tags, "aws");
    expect(result).not.toBe(tags);
    expect(result).toEqual(tags);
  });

  describe("GCP normalization", () => {
    it("lowercases keys and values", () => {
      const result = normalizeTags({ Environment: "Production" }, "gcp");
      expect(result).toEqual({ environment: "production" });
    });

    it("replaces special characters with hyphens", () => {
      const result = normalizeTags({ "Cost Center": "R&D" }, "gcp");
      expect(result).toEqual({ "cost-center": "r-d" });
    });

    it("prefixes keys starting with non-letter", () => {
      const result = normalizeTags({ "123key": "val" }, "gcp");
      expect(Object.keys(result)[0]).toMatch(/^[a-z]/);
    });

    it("does NOT prefix values starting with digits", () => {
      const result = normalizeTags({ version: "3.0.1" }, "gcp");
      expect(result.version).toBe("3-0-1");
    });

    it("truncates to 63 characters", () => {
      const longKey = "a".repeat(100);
      const result = normalizeTags({ [longKey]: "v" }, "gcp");
      const key = Object.keys(result)[0];
      expect(key).toBeDefined();
      expect(key?.length).toBeLessThanOrEqual(63);
    });

    it("collapses consecutive hyphens", () => {
      const result = normalizeTags({ "foo---bar": "val" }, "gcp");
      expect(result["foo-bar"]).toBe("val");
    });

    it("removes trailing hyphens", () => {
      const result = normalizeTags({ "foo-": "val-" }, "gcp");
      expect(Object.keys(result)[0]).not.toMatch(/-$/);
      expect(Object.values(result)[0]).not.toMatch(/-$/);
    });

    it("warns on key collisions and skips duplicates", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = normalizeTags({ "Foo Bar": "a", "foo-bar": "b" }, "gcp");
      expect(Object.keys(result)).toHaveLength(1);
      expect(result["foo-bar"]).toBe("a");
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]?.[0]).toContain("collision");
      warnSpy.mockRestore();
    });
  });
});

describe("isValidGcpLabel", () => {
  it("accepts valid labels", () => {
    expect(isValidGcpLabel("environment")).toBe(true);
    expect(isValidGcpLabel("cost-center")).toBe(true);
    expect(isValidGcpLabel("a123")).toBe(true);
    expect(isValidGcpLabel("my_label")).toBe(true);
  });

  it("rejects invalid labels", () => {
    expect(isValidGcpLabel("")).toBe(false);
    expect(isValidGcpLabel("123abc")).toBe(false);
    expect(isValidGcpLabel("UPPER")).toBe(false);
    expect(isValidGcpLabel("has space")).toBe(false);
    expect(isValidGcpLabel("a".repeat(64))).toBe(false);
  });
});

describe("mergeWithRequiredTags", () => {
  it("merges required tags with user tags", () => {
    const result = mergeWithRequiredTags(
      { environment: "prod", client: "acme", costCenter: "eng" },
      { custom: "value" }
    );
    expect(result).toEqual({
      environment: "prod",
      client: "acme",
      costCenter: "eng",
      managedBy: "pulumi-any-cloud",
      custom: "value",
    });
  });

  it("required tags override user tags", () => {
    const result = mergeWithRequiredTags(
      { environment: "prod", client: "acme", costCenter: "eng" },
      { managedBy: "terraform", environment: "dev" }
    );
    expect(result.managedBy).toBe("pulumi-any-cloud");
    expect(result.environment).toBe("prod");
  });

  it("works without user tags", () => {
    const result = mergeWithRequiredTags({
      environment: "prod",
      client: "acme",
      costCenter: "eng",
    });
    expect(result.managedBy).toBe("pulumi-any-cloud");
    expect(Object.keys(result)).toHaveLength(4);
  });
});
