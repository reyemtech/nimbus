/**
 * Message queue interfaces for @reyemtech/pulumi-any-cloud.
 *
 * Abstracts managed queues (SQS, Service Bus, Pub/Sub) and
 * operator-based queues (NATS, RabbitMQ, Kafka).
 *
 * @module queue/interfaces
 */

import type * as pulumi from "@pulumi/pulumi";
import type { CloudArg, ResolvedCloudTarget } from "../types";

/** Supported queue engines. */
export type QueueEngine =
  | "sqs" // AWS SQS
  | "service-bus" // Azure Service Bus
  | "pub-sub" // GCP Pub/Sub
  | "nats" // NATS (in-cluster)
  | "rabbitmq" // RabbitMQ (in-cluster)
  | "kafka"; // Kafka/Strimzi (in-cluster)

/** Queue deployment mode. */
export type QueueMode = "managed" | "operator";

/** Queue type (delivery semantics). */
export type QueueType =
  | "standard" // At-least-once, unordered
  | "fifo" // Exactly-once, ordered
  | "streaming"; // Log-based (Kafka, NATS JetStream)

/**
 * Queue configuration input.
 *
 * @example
 * ```typescript
 * const config: IQueueConfig = {
 *   cloud: "aws",
 *   engine: "sqs",
 *   queueType: "fifo",
 * };
 * ```
 */
export interface IQueueConfig {
  readonly cloud: CloudArg;
  /** Auto-selected based on cloud if omitted. */
  readonly engine?: QueueEngine;
  readonly mode?: QueueMode;
  readonly queueType?: QueueType;
  readonly tags?: Readonly<Record<string, string>>;
}

/** Queue output — the created queue resource. */
export interface IQueue {
  readonly name: string;
  readonly cloud: ResolvedCloudTarget;
  readonly engine: QueueEngine;
  readonly endpoint: pulumi.Output<string>;

  /** Escape hatch: cloud-native or operator queue resource. */
  readonly nativeResource: pulumi.Resource;
}
