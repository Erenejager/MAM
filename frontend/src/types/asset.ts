export interface Asset {
  id: string;
  originalFilename: string;
  filepath: string;
  fileSize: number | null;
  fileHash: string | null;
  status: 'ingesting' | 'ready' | 'error';
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  bitrate: number | null;
  frameRate: number | null;
  metadataStatus: string;
  thumbnailPath: string | null;
  thumbnailStatus: string;
  transcriptPath: string | null;
  transcriptText: string | null;
  transcriptionStatus: 'pending' | 'processing' | 'ready' | 'failed';
  transcriptionError: string | null;
  searchIndexStatus: string;
  title: string | null;
  description: string | null;
  tags: string; // JSON string — parse with JSON.parse() to get string[]
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface CustomField {
  id: string;
  name: string;
  fieldType: string;
  createdAt: string;
}

export interface CustomValue {
  assetId: string;
  fieldId: string;
  value: string | null;
}

export interface SearchTranscriptMatch {
  text: string;          // highlight fragment with <em> tags
  timestamp: number;     // start time in seconds
  matchCount: number;    // approximate total transcript matches
}

export interface SearchResult {
  id: string;
  score: number;
  highlights: {
    title?: string[];
    description?: string[];
    transcript?: string[];
  };
  transcriptMatch?: SearchTranscriptMatch;
}

export interface SearchResponse {
  results: SearchResult[];
  error?: string;
}
