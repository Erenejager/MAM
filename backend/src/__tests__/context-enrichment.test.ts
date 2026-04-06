import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichMoments, type EnrichmentInput } from '../lib/ocr/context-enrichment.js';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Mock ffmpeg and audio energy since we can't run ffmpeg in unit tests
vi.mock('../lib/ocr/audio-peaks.js', () => ({
  computeFinegrainEnergy: vi.fn().mockResolvedValue({
    offset: 30,
    energies: Array(180).fill(0.5),
  }),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: Function) => {
    cb(null, '', '');
  }),
}));

describe('enrichMoments', () => {
  const testDir = resolve(tmpdir(), `mam-test-enrich-${Date.now()}`);

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(testDir, { recursive: true });
  });

  it('creates moments directory structure with context.json', async () => {
    const input: EnrichmentInput = {
      videoPath: '/fake/video.mp4',
      assetDir: testDir,
      durationSeconds: 600,
      moments: [
        {
          timestamp: 120,
          label: 'Break of serve',
          score: '3-2',
          set_period: 'Set 1',
          game_time: null,
          transcript: 'What a shot',
          audio_energy: 0.8,
          startTime: 110,
          endTime: 130,
          peakTime: 120,
        },
      ],
      transcriptSegments: [
        { start: 115, end: 118, text: 'incredible shot down the line' },
        { start: 119, end: 122, text: 'and he breaks serve' },
      ],
      sport: 'Tennis',
      competition: 'Roland Garros',
    };

    await enrichMoments(input);

    const contextPath = resolve(testDir, 'moments', '0', 'context.json');
    const context = JSON.parse(await readFile(contextPath, 'utf-8'));

    expect(context.label).toBe('Break of serve');
    expect(context.score).toBe('3-2');
    expect(context.sport).toBe('Tennis');
    expect(context.suggestedStartTime).toBe(110);
    expect(context.suggestedEndTime).toBe(130);
    expect(context.peakTime).toBe(120);
  });

  it('stores transcript segments within ±60s of peak', async () => {
    const input: EnrichmentInput = {
      videoPath: '/fake/video.mp4',
      assetDir: testDir,
      durationSeconds: 600,
      moments: [
        {
          timestamp: 300,
          label: 'Goal',
          score: '1-0',
          set_period: 'First Half',
          game_time: '32:00',
          transcript: 'Goal!',
          audio_energy: 0.95,
          startTime: 290,
          endTime: 310,
          peakTime: 300,
        },
      ],
      transcriptSegments: [
        { start: 100, end: 105, text: 'far away segment' },
        { start: 250, end: 255, text: 'building up nicely' },
        { start: 298, end: 302, text: 'he scores a goal' },
        { start: 350, end: 355, text: 'another segment in range' },
        { start: 400, end: 405, text: 'too far after' },
      ],
      sport: 'Football',
      competition: null,
    };

    await enrichMoments(input);

    const transcriptPath = resolve(testDir, 'moments', '0', 'transcript.json');
    const segments = JSON.parse(await readFile(transcriptPath, 'utf-8'));

    expect(segments).toHaveLength(3);
    expect(segments[0].text).toBe('building up nicely');
    expect(segments[1].text).toBe('he scores a goal');
    expect(segments[2].text).toBe('another segment in range');
  });

  it('computes score delta from previous moment', async () => {
    const input: EnrichmentInput = {
      videoPath: '/fake/video.mp4',
      assetDir: testDir,
      durationSeconds: 600,
      moments: [
        {
          timestamp: 100, label: 'Point 1', score: '15-0', set_period: 'Set 1',
          game_time: null, transcript: '', audio_energy: 0.5,
          startTime: 90, endTime: 110, peakTime: 100,
        },
        {
          timestamp: 200, label: 'Point 2', score: '30-0', set_period: 'Set 1',
          game_time: null, transcript: '', audio_energy: 0.6,
          startTime: 190, endTime: 210, peakTime: 200,
        },
        {
          timestamp: 300, label: 'Point 3', score: '30-0', set_period: 'Set 1',
          game_time: null, transcript: '', audio_energy: 0.4,
          startTime: 290, endTime: 310, peakTime: 300,
        },
      ],
      transcriptSegments: [],
      sport: 'Tennis',
      competition: null,
    };

    await enrichMoments(input);

    const ctx0 = JSON.parse(await readFile(resolve(testDir, 'moments', '0', 'context.json'), 'utf-8'));
    expect(ctx0.scoreBefore).toBeNull();
    expect(ctx0.scoreAfter).toBe('15-0');

    const ctx1 = JSON.parse(await readFile(resolve(testDir, 'moments', '1', 'context.json'), 'utf-8'));
    expect(ctx1.scoreBefore).toBe('15-0');
    expect(ctx1.scoreAfter).toBe('30-0');
    expect(ctx1.scoreChanged).toBe(true);

    const ctx2 = JSON.parse(await readFile(resolve(testDir, 'moments', '2', 'context.json'), 'utf-8'));
    expect(ctx2.scoreBefore).toBe('30-0');
    expect(ctx2.scoreAfter).toBe('30-0');
    expect(ctx2.scoreChanged).toBe(false);
  });
});
