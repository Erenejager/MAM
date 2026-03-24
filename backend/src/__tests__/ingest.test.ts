import { describe, it, expect } from 'vitest';

describe('IMP-01: Upload endpoint', () => {
  it.todo('POST /api/assets accepts file and returns 202 with asset id');
  it.todo('POST /api/assets returns 400 when no file provided');
});

describe('IMP-02: Duplicate detection', () => {
  it.todo('rejects duplicate file hash with 409');
  it.todo('saveAndHash returns correct SHA-256 hex digest');
});

describe('META-01: Metadata extraction', () => {
  it.todo('extractMetadata returns duration, codec, resolution, frame_rate, file_size');
  it.todo('handles missing video stream gracefully');
  it.todo('parses frame rate fraction string to number');
});

describe('BRWS-02: Thumbnail generation', () => {
  it.todo('generateThumbnail creates a jpg file on disk');
});

describe('IMP-03: Pipeline status tracking', () => {
  it.todo('GET /api/assets/:id returns per-stage status fields');
  it.todo('pipeline updates status columns at each stage');
});
