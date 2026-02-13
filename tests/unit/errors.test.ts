import { describe, it, expect } from "vitest";
import {
  AnyCloudError,
  CloudValidationError,
  CidrError,
  UnsupportedFeatureError,
  ConfigError,
  assertNever,
  ERROR_CODES,
} from "../../src/types/errors";

describe("AnyCloudError", () => {
  it("sets code and message", () => {
    const error = new AnyCloudError("test", ERROR_CODES.CLOUD_VALIDATION);
    expect(error.message).toBe("test");
    expect(error.code).toBe("CLOUD_VALIDATION");
    expect(error.name).toBe("AnyCloudError");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("CloudValidationError", () => {
  it("extends AnyCloudError with CLOUD_VALIDATION code", () => {
    const error = new CloudValidationError("bad provider");
    expect(error.code).toBe("CLOUD_VALIDATION");
    expect(error.name).toBe("CloudValidationError");
    expect(error).toBeInstanceOf(AnyCloudError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("CidrError", () => {
  it("supports CIDR_OVERLAP code", () => {
    const error = new CidrError("overlap", "CIDR_OVERLAP", ["10.0.0.0/16", "10.0.0.0/16"]);
    expect(error.code).toBe("CIDR_OVERLAP");
    expect(error.cidrs).toEqual(["10.0.0.0/16", "10.0.0.0/16"]);
    expect(error.name).toBe("CidrError");
  });

  it("supports CIDR_INVALID code", () => {
    const error = new CidrError("invalid cidr", "CIDR_INVALID");
    expect(error.code).toBe("CIDR_INVALID");
    expect(error.cidrs).toBeUndefined();
  });
});

describe("UnsupportedFeatureError", () => {
  it("includes feature and provider", () => {
    const error = new UnsupportedFeatureError("auto-mode", "azure");
    expect(error.feature).toBe("auto-mode");
    expect(error.provider).toBe("azure");
    expect(error.code).toBe("UNSUPPORTED_FEATURE");
    expect(error.message).toContain("auto-mode");
    expect(error.message).toContain("azure");
  });
});

describe("ConfigError", () => {
  it("supports CONFIG_MISSING", () => {
    const error = new ConfigError("missing region", "CONFIG_MISSING", "any-cloud:region");
    expect(error.code).toBe("CONFIG_MISSING");
    expect(error.configKey).toBe("any-cloud:region");
  });

  it("supports CONFIG_INVALID", () => {
    const error = new ConfigError("bad value", "CONFIG_INVALID");
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.configKey).toBeUndefined();
  });
});

describe("assertNever", () => {
  it("throws UnsupportedFeatureError", () => {
    expect(() => assertNever("unexpected" as never)).toThrow(UnsupportedFeatureError);
  });
});

describe("ERROR_CODES", () => {
  it("has all expected codes", () => {
    expect(ERROR_CODES.CLOUD_VALIDATION).toBe("CLOUD_VALIDATION");
    expect(ERROR_CODES.CIDR_OVERLAP).toBe("CIDR_OVERLAP");
    expect(ERROR_CODES.CIDR_INVALID).toBe("CIDR_INVALID");
    expect(ERROR_CODES.UNSUPPORTED_FEATURE).toBe("UNSUPPORTED_FEATURE");
    expect(ERROR_CODES.CONFIG_MISSING).toBe("CONFIG_MISSING");
    expect(ERROR_CODES.CONFIG_INVALID).toBe("CONFIG_INVALID");
    expect(ERROR_CODES.SECRET_NOT_FOUND).toBe("SECRET_NOT_FOUND");
    expect(ERROR_CODES.PROVIDER_MISMATCH).toBe("PROVIDER_MISMATCH");
  });
});
