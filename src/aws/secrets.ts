/**
 * AWS Secrets Manager implementation.
 *
 * @module aws/secrets
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { ISecretRef, ISecrets, ISecretsConfig } from "../secrets";
import { resolveCloudTarget } from "../types";

/**
 * Create an AWS Secrets Manager store.
 *
 * Each `putSecret(path, data)` call creates a Secret resource with
 * JSON-encoded key-value pairs. `getSecretRef(ref)` retrieves a
 * specific key from a stored secret.
 *
 * @example
 * ```typescript
 * const secrets = createAwsSecrets("prod", {
 *   cloud: "aws",
 *   backend: "aws-secrets-manager",
 * });
 *
 * secrets.putSecret("database", { host: "db.example.com", password: dbPassword });
 * const pw = secrets.getSecretRef({ path: "database", key: "password" });
 * ```
 */
export function createAwsSecrets(name: string, config: ISecretsConfig): ISecrets {
  const cloud = Array.isArray(config.cloud) ? (config.cloud[0] ?? "aws") : config.cloud;
  const target = resolveCloudTarget(cloud);

  const tags = config.tags ?? {};

  // Track created secrets so getSecretRef can resolve them
  const secretResources = new Map<string, aws.secretsmanager.Secret>();

  // A "store" resource to serve as the nativeResource escape hatch.
  // We use a dummy SSM parameter to represent the store itself.
  const store = new aws.ssm.Parameter(`${name}-secrets-store`, {
    name: `/${name}/secrets-store`,
    type: aws.ssm.ParameterType.String,
    value: "managed-by-pulumi-any-cloud",
    tags: { ...tags, Name: `${name}-secrets-store` },
  });

  return {
    name,
    cloud: target,
    backend: "aws-secrets-manager",
    nativeResource: store,

    putSecret(path: string, data: Record<string, pulumi.Input<string>>): void {
      const secretName = `${name}/${path}`;
      const resourceName = `${name}-${path.replace(/\//g, "-")}`;

      const secret = new aws.secretsmanager.Secret(resourceName, {
        namePrefix: secretName,
        tags: { ...tags, Name: secretName },
      });

      // Store data as JSON
      const secretString = pulumi.all(data).apply((resolved) => JSON.stringify(resolved));

      new aws.secretsmanager.SecretVersion(`${resourceName}-v`, {
        secretId: secret.id,
        secretString,
      });

      secretResources.set(path, secret);
    },

    getSecretRef(ref: ISecretRef): pulumi.Output<string> {
      const secret = secretResources.get(ref.path);
      const { key } = ref;

      if (!secret) {
        // Secret not created via putSecret — look up by name convention
        const lookup = aws.secretsmanager.getSecretVersionOutput({
          secretId: `${name}/${ref.path}`,
        });

        if (key) {
          return lookup.secretString.apply((s) => {
            const parsed = JSON.parse(s) as Record<string, string>;
            return parsed[key] ?? "";
          });
        }
        return lookup.secretString;
      }

      // Get the current version of the secret
      const version = aws.secretsmanager.getSecretVersionOutput({
        secretId: secret.id,
      });

      if (key) {
        return version.secretString.apply((s) => {
          const parsed = JSON.parse(s) as Record<string, string>;
          return parsed[key] ?? "";
        });
      }
      return version.secretString;
    },
  };
}
