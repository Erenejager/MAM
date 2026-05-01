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
    localBaseline?: number | null;
    spikeScore?: number | null;
    percentileRank?: number | null;
    audioPeakShape?: 'spike' | 'sustained' | null;
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

export interface AudioProfileFrame {
  index: number;
  start: number;
  end: number;
  rmsEnergy: number;
  peakEnergy: number;
  energyDelta: number;
  zeroCrossingRate: number;
  silenceRatio: number;
  burstScore: number;
  spectralCentroid: number;
  spectralRolloff: number;
  spectralFlatness: number;
  spectralFlux: number;
}

export interface AudioProfileWindowSummary {
  index: number;
  start: number;
  end: number;
  windowSize: number;
  rmsEnergy: number;
  energyMean: number;
  energyMax: number;
  energyStdDev: number;
  burstCount: number;
  onsetRate: number;
  silenceRatio: number;
  activeDuration: number;
  sustainedLoudnessDuration: number;
  strongestAttackTime: number | null;
  strongestAttackScore: number;
  zeroCrossingRateMean: number;
  spectralCentroidMean: number;
  spectralCentroidStdDev: number;
  spectralRolloffMean: number;
  spectralFlatnessMean: number;
  spectralFluxMean: number;
  spectralFluxMax: number;
  onsetRegularity: number;
  rallyTextureScore: number;
  reactionBurstScore: number;
  speechDominanceScore: number;
  musicBedScore: number;
  umpireAnnouncementScore: number;
  applauseCrowdScore: number;
  crowdScore: number;
  commentatorScore: number;
  umpireScore: number;
  playerVocalizationScore: number;
  musicScore: number;
  pointShapeHint: 'short_point' | 'medium_rally' | 'long_rally' | 'reaction_only' | 'recap_only' | 'unknown';
  context?: AudioProfileContextHint;
}

export interface AudioProfileContextHint {
  speechDensity: number;
  hasCommentaryCue: boolean;
  hasReplayCue: boolean;
  hasScoreCue: boolean;
  rallyTextureScore: number;
  reactionBurstScore: number;
  speechDominanceScore: number;
  musicBedScore: number;
  applauseCrowdScore: number;
  crowdScore: number;
  commentatorScore: number;
  umpireScore: number;
  playerVocalizationScore: number;
  musicScore: number;
  pointShapeHint: AudioProfileWindowSummary['pointShapeHint'];
  suppressionReasons: Array<
    | 'high_speech_density'
    | 'commentary_cue'
    | 'replay_cue'
    | 'speech_dominance'
    | 'music_bed'
    | 'weak_reaction_burst'
  >;
}

export interface AudioProfile {
  frameSize: number;
  sampleRate: number;
  frames: AudioProfileFrame[];
  summaries: {
    oneSecond: AudioProfileWindowSummary[];
    fiveSecond: AudioProfileWindowSummary[];
  };
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
  audioProfile?: AudioProfile;
}

export interface AudioPeak {
  id: string;
  groupId: string;
  windowIndex: number;
  startTime: number;
  endTime: number;
  peakTime: number;
  audioEnergy: number;
  localBaseline: number;
  spikeScore: number;
  percentileRank: number;
  shape: 'spike' | 'sustained';
}

export type CandidatePlayPhase = 'live_action' | 'live_reaction' | 'between_points' | 'changeover_or_break' | 'unknown';
export type CandidateContentMode = 'live_view' | 'replay_or_slow_motion' | 'bench_or_player_closeup' | 'crowd_or_atmosphere' | 'studio_or_graphic' | 'unknown';
export type CandidateTranscriptRelation = 'current_action' | 'previous_action_recap' | 'next_point_setup' | 'generic' | 'unknown';

export interface CandidateWindowPacket {
  id: string;
  source: 'audio_peak';
  sourceRef: string;
  startTime: number;
  endTime: number;
  anchorTime: number;
  priority: 'high' | 'medium' | 'low';
  facets: {
    playPhase: CandidatePlayPhase;
    contentMode: CandidateContentMode;
    transcriptRelation: CandidateTranscriptRelation;
  };
  segmentId: string | null;
  segmentType: SegmentType | null;
  scoreboardPresent: boolean | null;
  speechDensity: number | null;
  audioSourceHint: 'crowd_or_reaction' | 'speech_or_commentary' | 'mixed_or_unknown';
  nearbyTranscript: string;
  linkedEventIds: string[];
  previousEventId: string | null;
  evidence: EvidenceRef[];
}

export type AudioReactionEpisodeRole = 'primary_anchor' | 'episode_tail' | 'recap_or_speech_tail';

export interface AudioReactionEpisodeMember {
  candidateWindowId: string;
  audioPeakId: string;
  anchorTime: number;
  role: AudioReactionEpisodeRole;
  audioSourceHint: CandidateWindowPacket['audioSourceHint'];
  spikeScore: number;
  percentileRank: number;
}

export interface AudioReactionEpisode {
  id: string;
  startTime: number;
  endTime: number;
  primaryCandidateWindowId: string;
  primaryAudioPeakId: string;
  primaryAnchorTime: number;
  primaryReason: 'first_strong_reaction' | 'best_available_peak';
  confidence: number;
  memberCount: number;
  members: AudioReactionEpisodeMember[];
  evidence: EvidenceRef[];
}

export interface ScoreboardDetection {
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
}

export interface ScoreboardDetectionRun {
  status: 'skipped' | 'complete' | 'failed';
  enabled: boolean;
  generatedAt: string;
  detectorImage: string | null;
  detectorModel: string | null;
  sampleCount: number;
  visibleCount: number;
  detections: ScoreboardDetection[];
  error?: string;
}

export interface MediaAnalysisResult {
  assetProfile: AssetProfile;
  timelineIndex: TimelineIndex;
  audioProfile?: AudioProfile;
  audioPeaks: AudioPeak[];
  audioReactionEpisodes?: AudioReactionEpisode[];
  candidateWindows?: CandidateWindowPacket[];
  scoreboardDetections?: ScoreboardDetectionRun;
  segments: SegmentSpan[];
  events: Event[];
}
