import PQueue from 'p-queue';

/**
 * Singleton pipeline queue with concurrency 1.
 * Sequential execution prevents SQLite BUSY errors
 * when multiple pipeline stages update the same asset row.
 */
export const pipelineQueue: InstanceType<typeof PQueue> = new PQueue({ concurrency: 1 });
