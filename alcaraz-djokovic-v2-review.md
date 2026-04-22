# Alcaraz vs Djokovic V2 Event Review

Source: `/tmp/media-analysis-v2-alcaraz-djokovic-escalated-2/media_analysis_v2/result.json`

Profile: domain=sports, format=live_match, sport=tennis, competition=null
Counts: 246 segments, 22 events

Review format: each item should end with `Correct`, `Wrong`, or `Borderline`, plus the action to take.

## Overall Judgment

Main pattern: the model often detects commentary, replay, or score-state narration instead of the actual point boundary.

Important missing event:
- The review should explicitly note a missing high-value set-point event or set-ending point. Catching important state transitions like set point, break point conversion, game end, and match end matters more than capturing every routine rally.

Expectation without volume peaks:
- We should expect good precision on scoreboard-driven moments when commentary and on-screen state are explicit: `deuce`, `advantage`, `break point`, `set point`, game won, set won, match won.
- We should expect duplicate suppression across adjacent segments and replay windows.
- We should expect the system to avoid firing on bench shots, slow motion, studio-style analysis, and pre-serve setup unless the event is clearly anchored to a completed point.
- We should not expect reliable detection of every "big crowd moment" if the only signal is crowd noise. Without volume-peak analysis, crowd excitement alone is too weak and too ambiguous.
- We should optimize for fewer, cleaner events rather than over-labeling. Missing some ordinary points is acceptable; missing decisive state changes is not.

## Item Review

## 1. 03:02 - point_won
- Label: Chilster drops wide. First break points of the evening saved.
- Confidence: 0.78
- Segment: segment_8
- Range: 03:00 -> 03:05
- Review: Wrong. Duplicate of item 2. Remove this one and keep the cleaner later event if only one should survive.

## 2. 03:07 - point_won
- Label: First break points of the evening saved.
- Confidence: 0.9
- Segment: segment_9
- Range: 03:05 -> 03:10
- Review: Borderline. Same point as item 1, but this is the better version. Keep only this event if deduping.

## 3. 04:22 - point_won
- Label: drama and the tension aren't we? Opening game break point saved for service.
- Confidence: 0.78
- Segment: segment_10
- Range: 04:20 -> 04:25
- Review: Wrong. Commentary refers to the previous point, but this timestamp is the start of the next point at 40-40 in the first game. Remove or retime to the actual point end.

## 4. 06:00 - analysis_point
- Label: Who in your mind Colin should this court these conditions favor in theory I know it's d...
- Confidence: 0.65
- Segment: segment_17
- Range: 05:55 -> 06:05
- Review: Correct. End of first game, players on the bench, analysis context rather than a point event.

## 5. 20:47 - point_won
- Label: What a forehand point of the match so far Djokovic comes out on top
- Confidence: 0.78
- Segment: segment_50
- Range: 20:45 -> 20:50
- Review: Borderline. This is the end of a point at 40-40, moving to advantage in a 2-2 game. Keep only if the system intends to capture important deuce-to-advantage swings; otherwise remove as ordinary point narration.

## 6. 23:17 - point_won
- Label: And shot back for the overhead Brilliant from Djokovic Goal!
- Confidence: 0.78
- Segment: segment_54
- Range: 23:15 -> 23:20
- Review: Borderline. This appears to be the real point result at 40-40 to advantage, but the following two events are replay duplicates. Keep this one and remove items 7 and 8.

## 7. 23:27 - point_won
- Label: Goal!
- Confidence: 0.78
- Segment: segment_54
- Range: 23:25 -> 23:30
- Review: Wrong. Replay or spillover duplicate of item 6. Remove.

## 8. 23:37 - point_won
- Label: Goal!
- Confidence: 0.78
- Segment: segment_54
- Range: 23:35 -> 23:40
- Review: Wrong. Replay or spillover duplicate of item 6. Remove.

## 9. 28:27 - point_won
- Label: so far a player who's had a look at a couple of break points
- Confidence: 0.7999999999999999
- Segment: segment_62
- Range: 28:25 -> 28:30
- Review: Wrong. This is set-state commentary at 3-2, not a completed point. Remove.

## 10. 36:12 - ace
- Label: All of a sudden, 15-30 becomes 15-40, and he's got his first break points to ...
- Confidence: 0.78
- Segment: segment_90
- Range: 36:10 -> 36:15
- Review: Wrong. Not an ace. Commentary describes the score change caused by the previous point, while the player is already preparing to serve at 3-4, 15-40. Remove or retime to the actual point that created 15-40.

## 11. 40:32 - point_won
- Label: three set points for the six-time champion
- Confidence: 0.95
- Segment: segment_108
- Range: 40:30 -> 40:35
- Review: Borderline. This correctly identifies a high-value set-point situation at 3-5, 0-40, but it is still a score-state call at the start of the point. Keep only if the product explicitly wants state-transition alerts; otherwise remove and instead capture the actual set-winning point. Also note that an important set-point or set-ending event appears to be missing nearby.

## 12. 57:52 - point_won
- Label: Yeah, far more recovery for Sinner Than the winner of this one
- Confidence: 0.78
- Segment: segment_156
- Range: 57:50 -> 57:55
- Review: Wrong. This is between-point commentary while Djokovic is preparing to serve at 3-6, 1-2, 15-15. Remove.

## 13. 01:04:17 - point_won
- Label: Deuce
- Confidence: 0.95
- Segment: segment_181
- Range: 01:04:15 -> 01:04:20
- Review: Wrong. Duplicate of item 14. Remove this earlier one.

## 14. 01:04:22 - point_won
- Label: Deuce
- Confidence: 0.95
- Segment: segment_182
- Range: 01:04:20 -> 01:04:25
- Review: Borderline. This is a clear score-state call at 3-6, 1-3, 40-40 with Alcaraz preparing to serve the next point. Keep only if deuce states are in scope; otherwise remove as pre-point state narration.

## 15. 01:06:37 - point_won
- Label: Yannick Sinner awaits the winner of this match if you weren't across the tenn...
- Confidence: 0.78
- Segment: segment_190
- Range: 01:06:35 -> 01:06:40
- Review: Wrong. Bench shot and commentary at 3-6, 2-3, not a point event. Remove.

## 16. 01:09:37 - point_won
- Label: Goal! What a rally! Maybe that sort of tennis will get him going.
- Confidence: 0.95
- Segment: segment_192
- Range: 01:09:35 -> 01:09:40
- Review: Correct. This is a real point won by Alcaraz, moving the game from 15-15 to 30-15 at 3-6, 2-3.

## 17. 01:14:37 - point_won
- Label: that's how you say break points
- Confidence: 0.78
- Segment: segment_206
- Range: 01:14:35 -> 01:14:40
- Review: Wrong. This is score-state commentary at 3-6, 2-3, 40-40 with Djokovic preparing to serve. Remove.

## 18. 01:15:27 - point_won
- Label: 30-40. That incredible point. Djokovic's average four-round speed was 141 kil...
- Confidence: 0.78
- Segment: segment_210
- Range: 01:15:25 -> 01:15:30
- Review: Wrong. Commentary is referring to the prior point while Djokovic is preparing to serve with advantage. Remove or retime to the actual point.

## 19. 01:16:07 - point_won
- Label: the way in which he saved that second break point of the game Djokovic leads ...
- Confidence: 0.78
- Segment: segment_210
- Range: 01:16:05 -> 01:16:10
- Review: Borderline. This is the end-of-game outcome at 3-6, 2-4 with players going to the bench. Keep if game-ending events are in scope; otherwise remove as post-point commentary.

## 20. 01:20:27 - point_won
- Label: 8th break point of the match for Djokovic
- Confidence: 0.7999999999999999
- Segment: segment_224
- Range: 01:20:25 -> 01:20:30
- Review: Borderline. This is a high-value break-point state at 3-6, 2-4, advantage Djokovic, with Alcaraz preparing to serve. Keep only if break-point states are in scope; otherwise remove as pre-point setup.

## 21. 01:21:47 - point_won
- Label: What a point. let's remind ourselves of
- Confidence: 0.78
- Segment: segment_226
- Range: 01:21:45 -> 01:21:50
- Review: Borderline. This is the end of the game at 3-6, 2-5 with Djokovic going to the bench. Keep if game-ending events are desired; otherwise remove as post-point recap.

## 22. 01:26:17 - point_won
- Label: Djokovic, too good in Turin this time. C3 is 2-2, 6-3, 6-2.
- Confidence: 0.64
- Segment: segment_243
- Range: 01:26:15 -> 01:26:20
- Review: Correct. End of match, Djokovic won. This is a high-value terminal event and should be kept.
