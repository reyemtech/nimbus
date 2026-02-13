import { describe, it, expect } from "vitest";
import {
  parseCidr,
  formatIp,
  cidrsOverlap,
  detectOverlaps,
  validateNoOverlaps,
  autoOffsetCidrs,
  buildCidrMap,
} from "../../src/network/cidr";
import { CidrError } from "../../src/types";

describe("parseCidr", () => {
  it("parses a valid /16 CIDR", () => {
    const result = parseCidr("10.0.0.0/16");
    expect(result.prefix).toBe(16);
    expect(result.size).toBe(65536);
  });

  it("parses a valid /24 CIDR", () => {
    const result = parseCidr("192.168.1.0/24");
    expect(result.prefix).toBe(24);
    expect(result.size).toBe(256);
  });

  it("throws on invalid CIDR format", () => {
    expect(() => parseCidr("not-a-cidr")).toThrow(CidrError);
  });

  it("throws on invalid octet values", () => {
    expect(() => parseCidr("999.0.0.0/16")).toThrow(CidrError);
  });

  it("throws on invalid prefix", () => {
    expect(() => parseCidr("10.0.0.0/33")).toThrow(CidrError);
  });
});

describe("formatIp", () => {
  it("formats a numeric IP to dotted notation", () => {
    expect(formatIp(0x0a000000)).toBe("10.0.0.0");
    expect(formatIp(0xc0a80100)).toBe("192.168.1.0");
  });
});

describe("cidrsOverlap", () => {
  it("detects overlapping CIDRs", () => {
    expect(cidrsOverlap("10.0.0.0/16", "10.0.1.0/24")).toBe(true);
  });

  it("detects non-overlapping CIDRs", () => {
    expect(cidrsOverlap("10.0.0.0/16", "10.1.0.0/16")).toBe(false);
  });

  it("detects identical CIDRs as overlapping", () => {
    expect(cidrsOverlap("10.0.0.0/16", "10.0.0.0/16")).toBe(true);
  });

  it("detects adjacent CIDRs as non-overlapping", () => {
    expect(cidrsOverlap("10.0.0.0/24", "10.0.1.0/24")).toBe(false);
  });
});

describe("detectOverlaps", () => {
  it("returns empty array for non-overlapping CIDRs", () => {
    const result = detectOverlaps(["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"]);
    expect(result).toEqual([]);
  });

  it("returns overlapping pairs", () => {
    const result = detectOverlaps(["10.0.0.0/16", "10.0.1.0/24", "10.1.0.0/16"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(["10.0.0.0/16", "10.0.1.0/24"]);
  });
});

describe("validateNoOverlaps", () => {
  it("does not throw for non-overlapping CIDRs", () => {
    expect(() => validateNoOverlaps(["10.0.0.0/16", "10.1.0.0/16"])).not.toThrow();
  });

  it("throws CidrError for overlapping CIDRs", () => {
    expect(() => validateNoOverlaps(["10.0.0.0/16", "10.0.1.0/24"])).toThrow(CidrError);
  });
});

describe("autoOffsetCidrs", () => {
  it("generates sequential /16 CIDRs", () => {
    const result = autoOffsetCidrs(3);
    expect(result).toEqual(["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"]);
  });

  it("supports custom base and step", () => {
    const result = autoOffsetCidrs(2, { base: 10, step: 10 });
    expect(result).toEqual(["10.10.0.0/16", "10.20.0.0/16"]);
  });

  it("supports custom prefix", () => {
    const result = autoOffsetCidrs(2, { prefix: 24 });
    expect(result).toEqual(["10.0.0.0/24", "10.1.0.0/24"]);
  });

  it("throws when second octet exceeds 255", () => {
    expect(() => autoOffsetCidrs(300)).toThrow(CidrError);
  });
});

describe("buildCidrMap", () => {
  it("auto-generates CIDRs for all clouds", () => {
    const result = buildCidrMap(["aws", "azure", "gcp"]);
    expect(result).toEqual({
      aws: "10.0.0.0/16",
      azure: "10.1.0.0/16",
      gcp: "10.2.0.0/16",
    });
  });

  it("uses explicit CIDRs when provided", () => {
    const result = buildCidrMap(["aws", "azure"], { aws: "172.16.0.0/16" });
    expect(result["aws"]).toBe("172.16.0.0/16");
    expect(result["azure"]).toBeDefined();
  });

  it("auto-fills missing clouds without overlap", () => {
    const result = buildCidrMap(["aws", "azure"], { aws: "10.0.0.0/16" });
    expect(result["aws"]).toBe("10.0.0.0/16");
    expect(result["azure"]).toBe("10.1.0.0/16");
  });

  it("throws on overlapping explicit CIDRs", () => {
    expect(() =>
      buildCidrMap(["aws", "azure"], {
        aws: "10.0.0.0/16",
        azure: "10.0.1.0/24",
      })
    ).toThrow(CidrError);
  });
});
