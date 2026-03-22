import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),                          // UUID
  originalFilename: text('original_filename').notNull(),
  filepath: text('filepath').notNull(),                 // relative to STORAGE_ROOT
  fileSize: integer('file_size'),
  status: text('status').default('ingesting'),          // ingesting | ready | error

  // Deduplication
  fileHash: text('file_hash').unique(),                 // SHA-256

  // Technical metadata (ffprobe)
  durationSeconds: real('duration_seconds'),
  width: integer('width'),
  height: integer('height'),
  codec: text('codec'),
  bitrate: integer('bitrate'),
  frameRate: real('frame_rate'),                        // META-01
  metadataStatus: text('metadata_status').default('pending'),

  // Thumbnail
  thumbnailPath: text('thumbnail_path'),
  thumbnailStatus: text('thumbnail_status').default('pending'),

  // Transcription
  transcriptPath: text('transcript_path'),
  transcriptText: text('transcript_text'),
  transcriptionStatus: text('transcription_status').default('pending'),
  transcriptionError: text('transcription_error'),      // error tracking

  // Search index
  searchIndexStatus: text('search_index_status').default('pending'),

  // User-editable
  title: text('title'),
  description: text('description'),
  tags: text('tags').default('[]'),                     // JSON array

  createdAt: text('created_at').default("(datetime('now'))"),
  updatedAt: text('updated_at').default("(datetime('now'))"),
});

export const customFields = sqliteTable('custom_fields', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  fieldType: text('field_type').default('text'),        // text | number | date | boolean
  createdAt: text('created_at').default("(datetime('now'))"),
});

export const assetCustomValues = sqliteTable('asset_custom_values', {
  assetId: text('asset_id').references(() => assets.id, { onDelete: 'cascade' }).notNull(),
  fieldId: text('field_id').references(() => customFields.id, { onDelete: 'cascade' }).notNull(),
  value: text('value'),
}, (table) => ({
  pk: primaryKey({ columns: [table.assetId, table.fieldId] }),
}));
