export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export type MediaDomain = 'sports' | 'news' | 'mixed' | 'general' | 'unknown';

export type AssetFormat =
  | 'live_match'
  | 'mixed_broadcast'
  | 'player_interview'
  | 'press_conference'
  | 'studio_show'
  | 'news_package'
  | 'feature_package'
  | 'unknown';

export interface EvidenceRef {
  type: 'frame' | 'transcript' | 'audio' | 'vision' | 'ocr_context' | 'heuristic';
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
    scoreTransitionStatus?: 'supports_result' | 'supports_state' | 'conflicts_result' | 'unknown';
    selectedBy?: 'transition_match' | 'label_match' | 'timing_match' | 'conflict_match';
    peakTime?: number | null;
    setPeriod?: string | null;
    audioEnergy?: number | null;
  };
}

export interface AssetProfile {
  domain: MediaDomain;
  format: AssetFormat;
  sport: string | null;
  competition: string | null;
  teams: string[];
  players: string[];
  confidence: number;
  evidence: EvidenceRef[];
}

export interface TimelineWindow {
  index: number;
  start: number;
  end: number;
  transcriptText: string;
  transcriptSegments: TranscriptSegment[];
  speechDensity: number;
  audioEnergy: number;
  hasQuestionCue: boolean;
  hasInterviewCue: boolean;
  hasCommentaryCue: boolean;
  hasReplayCue: boolean;
  hasScoreCue: boolean;
}

export type SegmentType =
  | 'live_play'
  | 'replay'
  | 'commentator_insert'
  | 'sideline_report'
  | 'player_interview'
  | 'press_conference'
  | 'studio_analysis'
  | 'graphics_only'
  | 'crowd'
  | 'unknown';

export type SpeechMode =
  | 'commentary'
  | 'interview_answer'
  | 'question'
  | 'reporter_monologue'
  | 'ambient'
  | null;

export interface SegmentSpan {
  id: string;
  start: number;
  end: number;
  type: SegmentType;
  subtype: string | null;
  speechMode: SpeechMode;
  scoreboardPresent: boolean | null;
  participants: string[];
  confidence: number;
  sourceWindowIndexes: number[];
  evidence: EvidenceRef[];
}

export type EventType =
  | 'goal'
  | 'save'
  | 'foul'
  | 'ace'
  | 'point_won'
  | 'pressure_state'
  | 'game_won'
  | 'set_won'
  | 'match_won'
  | 'quote'
  | 'question_answer'
  | 'analysis_point'
  | 'topic_shift'
  | 'crowd_reaction'
  | 'unknown';

export interface Event {
  id: string;
  segmentId: string;
  type: EventType;
  label: string;
  anchorTime: number;
  peakTime: number | null;
  startTime: number | null;
  endTime: number | null;
  importance: number;
  confidence: number;
  entities: string[];
  evidence: EvidenceRef[];
  parentEventId: string | null;
  validationStatus?: 'candidate' | 'validated' | 'rejected';
  relationType?: 'primary' | 'replay_of' | 'commentary_on' | 'quote_from' | 'leads_to' | 'result_of' | 'confirms' | null;
  ocrSupportStatus?: 'supports' | 'weak_support' | 'conflicts' | null;
  reliabilityRank?: number | null;
}

export interface TimelineIndex {
  windowSize: number;
  windows: TimelineWindow[];
}

export interface MediaAnalysisResult {
  assetProfile: AssetProfile;
  timelineIndex: TimelineIndex;
  segments: SegmentSpan[];
  events: Event[];
}
