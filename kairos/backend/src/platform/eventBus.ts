import { randomUUID } from 'node:crypto';
import type { PlatformEvent } from './contracts.js';

export type PlatformEventHandler<TPayload = Record<string, unknown>> = (
  event: PlatformEvent<TPayload>
) => void | Promise<void>;

export interface PublishPlatformEventInput<TPayload = Record<string, unknown>> {
  type: string;
  tenantId: string;
  subject: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
  version?: number;
}

export interface PlatformEventBus {
  publish<TPayload>(input: PublishPlatformEventInput<TPayload>): Promise<PlatformEvent<TPayload>>;
  subscribe<TPayload>(type: string, handler: PlatformEventHandler<TPayload>): () => void;
}

export class InMemoryPlatformEventBus implements PlatformEventBus {
  private readonly handlers = new Map<string, Set<PlatformEventHandler<unknown>>>();

  async publish<TPayload>(input: PublishPlatformEventInput<TPayload>): Promise<PlatformEvent<TPayload>> {
    const event: PlatformEvent<TPayload> = {
      id: randomUUID(),
      type: input.type,
      version: input.version ?? 1,
      occurredAt: new Date().toISOString(),
      tenantId: input.tenantId,
      subject: input.subject,
      correlationId: input.correlationId,
      causationId: input.causationId,
      payload: input.payload
    };

    const handlers = [
      ...(this.handlers.get(input.type) ?? []),
      ...(this.handlers.get('*') ?? [])
    ];

    for (const handler of handlers) {
      await handler(event as PlatformEvent<unknown>);
    }

    return event;
  }

  subscribe<TPayload>(type: string, handler: PlatformEventHandler<TPayload>): () => void {
    const handlers = this.handlers.get(type) ?? new Set<PlatformEventHandler<unknown>>();
    handlers.add(handler as PlatformEventHandler<unknown>);
    this.handlers.set(type, handlers);

    return () => {
      handlers.delete(handler as PlatformEventHandler<unknown>);
      if (handlers.size === 0) this.handlers.delete(type);
    };
  }
}
