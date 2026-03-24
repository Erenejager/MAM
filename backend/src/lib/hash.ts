import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'node:stream';

/**
 * Stream a file to disk while computing its SHA-256 hash.
 * Does NOT buffer the file in memory -- streams directly to disk.
 *
 * @returns Object with hex-encoded SHA-256 hash and byte size.
 */
export async function saveAndHash(
  fileStream: NodeJS.ReadableStream,
  destPath: string,
): Promise<{ hash: string; size: number }> {
  const hash = createHash('sha256');
  let bytesWritten = 0;

  const passThrough = new PassThrough();
  passThrough.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    bytesWritten += chunk.length;
  });

  const writeStream = createWriteStream(destPath);

  await pipeline(fileStream, passThrough, writeStream);

  return { hash: hash.digest('hex'), size: bytesWritten };
}
