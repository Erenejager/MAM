import { existsSync } from 'fs';
import { resolve } from 'path';

export function validateEnv(): void {
  const errors: string[] = [];

  // GROQ_API_KEY — required, block startup if missing
  if (!process.env.GROQ_API_KEY) {
    errors.push(
      'GROQ_API_KEY is not set. Get your API key from https://console.groq.com/keys and add it to your .env file.'
    );
  }

  // STORAGE_ROOT — required, must be an existing directory
  const storageRoot = process.env.STORAGE_ROOT;
  if (!storageRoot) {
    errors.push(
      'STORAGE_ROOT is not set. Set it to the directory where video files are stored (e.g., STORAGE_ROOT=/mnt/mam).'
    );
  } else {
    const resolved = resolve(storageRoot);
    if (!existsSync(resolved)) {
      errors.push(
        `STORAGE_ROOT directory does not exist: ${resolved}. Create it first or set STORAGE_ROOT to an existing directory.`
      );
    }
  }

  if (errors.length > 0) {
    console.error('\n=== STARTUP FAILED: Environment validation ===\n');
    errors.forEach((err, i) => console.error(`  ${i + 1}. ${err}`));
    console.error('\n===============================================\n');
    process.exit(1);
  }
}
