// The shapes the userscript's copyright module stored (scanClaims 4807–4823, scanAds 5271–5273,
// scanCollab 5473–5474, runs 5347 / 5554 / 5714, followUp 5747, autopilot 5823, songs 5078),
// and what the Studio tab tells the side panel.
export interface ClaimRow {
  videoId: string; video: string; privacy: string; length: number; claimId: string; song: string; artists: string;
  label: string; claimant: string; type: string; status: string; impact: string; segments: [number, number][];
  claimedSec: number; canTrim: boolean; options: string; own: boolean; hasImpact: boolean; publishAt: number;
  tracklist?: string; // the video's own tracklist line where the first claimed range starts (older scans lack it)
}
export interface ClaimScan { date: string; total: number; rows: ClaimRow[]; channel: string; channelName: string }
export interface AdsRow { videoId: string; video: string; privacy: string; length: number; ineligible: boolean; status: string }
export interface AdsScan { date: string; total: number; rows: AdsRow[] }
export interface CollabRow { videoId: string; video: string; privacy: string; length: number }
export interface CollabScan { date: string; total: number; rows: CollabRow[] }
export interface ResultEntry { state: string; msg: string; date: string }
export interface RunItem { videoId: string; video: string; state: string; msg: string; key?: string; claimId?: string; song?: string }
export interface Run { active: boolean; items: RunItem[]; started: string; mode?: 'auto' | 'review'; channel?: string; handles?: string[] }
export type FollowUp = Record<string, {
  video: string; pending: { key: string; claimId: string; song: string; tries: number }[]; lastClaimId: string | null; lastSavedAt: number;
}>;
export interface Autopilot { on: boolean; next: number; last?: number }
export interface SongEntry {
  title: string; artists: string; label: string; claimants: string[]; types: string[]; firstSeen: string; lastSeen: string;
  videos: Record<string, { video: string; channel: string; status: string; impact?: string }>; trimmed: number;
}
export type Songs = Record<string, SongEntry>;
export interface ClaimsCfg {
  autoSaveTrim: boolean; autoSaveManualTrim: boolean; followUpMinutes: string; ownNames: string; apEveryHours: string;
  apSkipOwn: boolean; apOnlyImpact: boolean; apMaxPct: string; apMaxPerCycle: string; apAdsOn: boolean;
}
// computeStatus() (6122–6170): what the status card shows.
export interface ClaimsStatus {
  icon: string; kind: string; title: string; detail: string;
  progress?: number | null; steps?: string[]; stepIdx?: number; stepDetail?: string;
}
// getCounts() (4637–4653).
export interface ClaimsCounts { hasScan: boolean; scanDate: string; claims: number; claimVideos: number; songs: number; hasAdsScan: boolean; adsTodo: number }
// What renderStatus() (6219–6256) read, as the Studio tab sends it (claims:state / claims:view).
export interface ClaimsState {
  proto: number; // messages.ts PROTOCOL of the tab's build
  channel: string; // currentChannel(): the suffix of this channel's keys
  channelName: string;
  ready: boolean; // Studio's INNERTUBE_CONTEXT is there (scans can start)
  english: boolean; // studioIsEnglish(): trimming / ads need Studio in English
  uploadBusy: boolean; // the upload queue has work: jobs that change pages wait
  status: ClaimsStatus;
  counts: ClaimsCounts;
  busyRun: boolean; // a trim / ads / Collab run is active
  busyScan: boolean;
  waiting: number; // fuCount(): claims waiting for a follow-up trim
  workerHere: boolean; // no other Studio tab holds the runner lock
}
export interface ClaimsLogLine { at: number; msg: string; type: string }
export type ClaimsView = 'claims' | 'ads' | 'collab';
