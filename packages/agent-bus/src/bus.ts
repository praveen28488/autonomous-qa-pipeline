import Redis from 'ioredis';
import { AgentMessage, AgentMessageSchema } from '@qa/schemas';

export const createBus = (redisUrl = 'redis://localhost:6379') => {
  // Two separate connections: subscribed clients cannot run regular commands
  const pub = new Redis(redisUrl, {
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: false,
  });
  const sub = pub.duplicate();

  pub.on('error', (e) => console.error('[bus:pub]', e.message));
  sub.on('error', (e) => console.error('[bus:sub]', e.message));
  pub.on('connect', () => console.log('[bus] publisher connected'));

  return {
    /** Publish a validated message. Throws ZodError if message is invalid. */
    async publish(channel: string, msg: AgentMessage): Promise<void> {
      AgentMessageSchema.parse(msg);
      await pub.publish(channel, JSON.stringify(msg));
    },

    /** Subscribe to a channel pattern (supports * wildcards). */
    async subscribe(
      pattern: string,
      handler: (msg: AgentMessage, channel: string) => Promise<void>
    ): Promise<void> {
      await sub.psubscribe(pattern);
      sub.on('pmessage', async (_, chan, raw) => {
        try {
          const parsed = AgentMessageSchema.safeParse(JSON.parse(raw));
          if (!parsed.success) {
            console.error(`[bus] schema violation on ${chan}:`, parsed.error.issues);
            return;
          }
          await handler(parsed.data, chan);
        } catch (e) {
          console.error(`[bus] handler error on ${chan}:`, e);
        }
      });
    },

    /** Append to a Redis Stream for durable, replayable messages. */
    async xadd(stream: string, msg: AgentMessage): Promise<void> {
      AgentMessageSchema.parse(msg);
      await pub.xadd(
        stream, '*',
        'type',    msg.type,
        'agentId', msg.agentId,
        'payload', JSON.stringify(msg.payload),
        'corrId',  msg.correlationId ?? ''
      );
    },

    /** Ping Redis — for health checks. */
    async ping(): Promise<boolean> {
      try { return (await pub.ping()) === 'PONG'; }
      catch { return false; }
    },

    async close(): Promise<void> {
      pub.disconnect();
      sub.disconnect();
    },
  };
};

export type Bus = ReturnType<typeof createBus>;
