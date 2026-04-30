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
  framesStatus: string;
  transcriptPath: string | null;
  transcriptText: string | null;
  transcriptionStatus: 'pending' | 'processing' | 'ready' | 'complete' | 'failed';
  transcriptionError: string | null;
  searchIndexStatus: string;
  ocrStatus: 'pending' | 'processing' | 'complete' | 'skipped' | 'failed';
  ocrError: string | null;
  ocrSport: string | null;
  ocrCompetition: string | null;
  ocrPlayers: string | null;
  ocrKeyMoments: string | null;
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

export interface SearchTranscriptMatchItem {
  text: string;
  timestamp: number;
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
  transcriptMatches?: SearchTranscriptMatchItem[];
}

export interface SearchResponse {
  results: SearchResult[];
  error?: string;
}

export interface MediaAnalysisSummary {
  generatedAt: string;
  assetProfile: {
    domain: 'sports' | 'news' | 'mixed' | 'general' | 'unknown';
    format:
      | 'live_match'
      | 'mixed_broadcast'
      | 'player_interview'
      | 'press_conference'
      | 'studio_show'
      | 'news_package'
      | 'feature_package'
      | 'unknown';
    sport: string | null;
    competition: string | null;
    confidence: number;
  };
  counts: {
    segments: number;
    events: number;
    audioPeaks?: number;
    audioProfileFrames?: number;
    audioProfileOneSecondSummaries?: number;
    audioProfileFiveSecondSummaries?: number;
    audioReactionEpisodes?: number;
    candidateWindows?: number;
    scoreboardDetectionSamples?: number;
    scoreboardVisibleFrames?: number;
  };
  ocrSupportCounts: Array<{ status: 'supports' | 'weak_support' | 'conflicts'; count: number }>;
  scoreTransitionCounts: Array<{
    status: 'supports_result' | 'supports_state' | 'conflicts_result' | 'unknown';
    count: number;
  }>;
  selectedByCounts: Array<{
    reason: 'transition_match' | 'label_match' | 'timing_match' | 'conflict_match';
    count: number;
  }>;
  reliabilityCounts: Array<{ bucket: 'top_5' | 'top_10' | 'top_20'; count: number }>;
  segmentTypes: Array<{ type: string; count: number }>;
  eventTypes: Array<{ type: string; count: number }>;
}

export interface MediaAnalysisStatus {
  status: 'idle' | 'running' | 'complete' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface MediaAnalysisEvidence {
  type: string;
  ref: string;
  confidence?: number;
  note?: string;
  status?: 'supports' | 'weak_support' | 'conflicts';
  metadata?: {
    label?: string | null;
    score?: string | null;
    scoreBefore?: string | null;
    scoreAfter?: string | null;
    scoreChanged?: boolean | null;
    peakTime?: number | null;
    setPeriod?: string | null;
    audioEnergy?: number | null;
  };
}

export interface MediaAnalysisResult {
  assetProfile: {
    domain: 'sports' | 'news' | 'mixed' | 'general' | 'unknown';
    format:
      | 'live_match'
      | 'mixed_broadcast'
      | 'player_interview'
      | 'press_conference'
      | 'studio_show'
      | 'news_package'
      | 'feature_package'
      | 'unknown';
    sport: string | null;
    competition: string | null;
    teams: string[];
    players: string[];
    confidence: number;
    evidence: MediaAnalysisEvidence[];
  };
  timelineIndex: {
    windowSize: number;
    windows: Array<{
      index: number;
      start: number;
      end: number;
      transcriptText: string;
      speechDensity: number;
      audioEnergy: number;
      hasQuestionCue: boolean;
      hasInterviewCue: boolean;
      hasCommentaryCue: boolean;
      hasReplayCue: boolean;
      hasScoreCue: boolean;
    }>;
  };
  segments: Array<{
    id: string;
    start: number;
    end: number;
    type: string;
    subtype: string | null;
    speechMode: string | null;
    scoreboardPresent: boolean | null;
    participants: string[];
    confidence: number;
    sourceWindowIndexes: number[];
    evidence: MediaAnalysisEvidence[];
  }>;
  events: Array<{
    id: string;
    segmentId: string;
    type: string;
    label: string;
    anchorTime: number;
    peakTime: number | null;
    startTime: number | null;
    endTime: number | null;
    importance: number;
    confidence: number;
    entities: string[];
    evidence: MediaAnalysisEvidence[];
    parentEventId: string | null;
    validationStatus?: 'candidate' | 'validated' | 'rejected';
    relationType?: 'primary' | 'replay_of' | 'commentary_on' | 'quote_from' | 'leads_to' | 'result_of' | 'confirms' | null;
    ocrSupportStatus?: 'supports' | 'weak_support' | 'conflicts' | null;
    reliabilityRank?: number | null;
  }>;
  scoreboardDetections?: {
    status: 'skipped' | 'complete' | 'failed';
    enabled: boolean;
    generatedAt: string;
    detectorImage: string | null;
    detectorModel: string | null;
    sampleCount: number;
    visibleCount: number;
    detections: Array<{
      candidateWindowId: string | null;
      audioPeakId: string | null;
      linkedEventIds: string[];
      anchorTime: number;
      sampleLabel: string;
      sampleSource: 'audio' | 'fallback';
      sampleTime: number;
      framePath: string;
      detectorFrame: string;
      scoreboardVisible: boolean;
      scoreboardConfidence: number | null;
      scoreboardBbox: { x1: number; y1: number; x2: number; y2: number } | null;
      scoreboardCropPath: string | null;
      imageWidth: number | null;
      imageHeight: number | null;
      detectorSource: string | null;
      detectorError: string | null;
    }>;
    error?: string;
  };
}
