/**
 * Unit tests for state backend factory dispatch logic.
 *
 * Tests the createStateBackend factory's routing, error handling,
 * and config passthrough without requiring cloud provider SDKs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IStateBackend } from "../../src/state";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOutput = (val: unknown): any => val;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResource = (): any => ({});

function makeStateBackend(
  name: string,
  provider: "aws" | "azure",
  config?: Partial<IStateBackend>
): IStateBackend {
  return {
    name,
    cloud: { provider, region: provider === "aws" ? "us-east-1" : "eastus" },
    backendType: provider === "aws" ? "s3" : "azblob",
    backendUrl: mockOutput(provider === "aws" ? `s3://${name}-state` : `azblob://pulumistate`),
    bucketName: mockOutput(provider === "aws" ? `${name}-state` : "pulumistate"),
    lockTableName: provider === "aws" ? mockOutput(`${name}-state-lock`) : undefined,
    storageAccountName: provider === "azure" ? mockOutput(`${name}state`) : undefined,
    versioning: config?.versioning ?? true,
    encryption: config?.encryption ?? true,
    replicationEnabled: config?.replicationEnabled ?? false,
    nativeResource: mockResource(),
  };
}

// Mock cloud-specific implementations
vi.mock("../../src/aws", () => ({
  createAwsStateBackend: vi.fn((name: string, config: Record<string, unknown>) =>
    makeStateBackend(name, "aws", {
      versioning: (config.versioning as boolean) ?? true,
      encryption: (config.encryption as boolean) ?? true,
      replicationEnabled: Boolean(
        (config.replication as Record<string, unknown> | undefined)?.enabled
      ),
    })
  ),
}));

vi.mock("../../src/azure", () => ({
  createAzureStateBackend: vi.fn((name: string, config: Record<string, unknown>) =>
    makeStateBackend(name, "azure", {
      versioning: (config.versioning as boolean) ?? true,
      encryption: (config.encryption as boolean) ?? true,
      replicationEnabled: Boolean(
        (config.replication as Record<string, unknown> | undefined)?.enabled
      ),
    })
  ),
}));

import { createStateBackend } from "../../src/factories/state";
import { createAwsStateBackend } from "../../src/aws";
import { createAzureStateBackend } from "../../src/azure";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createStateBackend factory", () => {
  it("dispatches to AWS for cloud: 'aws'", async () => {
    const result = await createStateBackend("prod", {
      cloud: "aws",
    });

    expect(createAwsStateBackend).toHaveBeenCalledTimes(1);
    expect(createAzureStateBackend).not.toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(false);
    expect((result as IStateBackend).backendType).toBe("s3");
  });

  it("dispatches to Azure for cloud: 'azure' with providerOptions", async () => {
    const result = await createStateBackend("prod", {
      cloud: "azure",
      providerOptions: { azure: { resourceGroupName: "my-rg" } },
    });

    expect(createAzureStateBackend).toHaveBeenCalledTimes(1);
    expect(createAwsStateBackend).not.toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(false);
    expect((result as IStateBackend).backendType).toBe("azblob");
  });

  it("throws for Azure without providerOptions", async () => {
    await expect(
      createStateBackend("prod", {
        cloud: "azure",
      })
    ).rejects.toThrow("Azure requires providerOptions.azure.resourceGroupName");
  });

  it("returns array for multi-cloud", async () => {
    const result = await createStateBackend("prod", {
      cloud: ["aws", "azure"],
      providerOptions: { azure: { resourceGroupName: "my-rg" } },
    });

    expect(Array.isArray(result)).toBe(true);
    expect((result as IStateBackend[]).length).toBe(2);
    expect(createAwsStateBackend).toHaveBeenCalledTimes(1);
    expect(createAzureStateBackend).toHaveBeenCalledTimes(1);
  });

  it("prefixes resource names with provider for multi-cloud", async () => {
    await createStateBackend("prod", {
      cloud: ["aws", "azure"],
      providerOptions: { azure: { resourceGroupName: "my-rg" } },
    });

    expect(vi.mocked(createAwsStateBackend).mock.calls[0]?.[0]).toBe("prod-aws");
    expect(vi.mocked(createAzureStateBackend).mock.calls[0]?.[0]).toBe("prod-azure");
  });

  it("throws for unsupported provider", async () => {
    await expect(
      createStateBackend("prod", {
        cloud: "gcp" as "aws",
      })
    ).rejects.toThrow("state-backend");
  });

  it("passes versioning config through", async () => {
    const result = (await createStateBackend("prod", {
      cloud: "aws",
      versioning: true,
      encryption: true,
    })) as IStateBackend;

    expect(result.versioning).toBe(true);
    expect(result.encryption).toBe(true);
  });

  it("passes replication config through", async () => {
    const result = (await createStateBackend("prod", {
      cloud: "aws",
      replication: { enabled: true, destinationRegion: "us-west-2" },
    })) as IStateBackend;

    expect(result.replicationEnabled).toBe(true);
  });

  it("passes locking config through to AWS", async () => {
    await createStateBackend("prod", {
      cloud: "aws",
      locking: { enabled: true, dynamoDbTableName: "custom-lock-table" },
    });

    const config = vi.mocked(createAwsStateBackend).mock.calls[0]?.[1];
    expect(config?.locking).toEqual({
      enabled: true,
      dynamoDbTableName: "custom-lock-table",
    });
  });

  it("passes AWS state options from providerOptions", async () => {
    await createStateBackend("prod", {
      cloud: "aws",
      providerOptions: {
        aws: { stateKmsKeyArn: "arn:aws:kms:us-east-1:123:key/abc", stateForceDestroy: true },
      },
    });

    const options = vi.mocked(createAwsStateBackend).mock.calls[0]?.[2];
    expect(options).toEqual({
      kmsKeyArn: "arn:aws:kms:us-east-1:123:key/abc",
      forceDestroy: true,
    });
  });
});
