export type Placement =
  | 'income_x2'
  | 'autopilot'
  | 'free_tornado'
  | 'free_upgrade'
  | 'offline_x3'
  | 'gift_x3'
  | 'farm_complete_x2'
  | 'daily_x2';

export type BreakKind = 'barn_unload' | 'dialog_closed';

/**
 * How a rewarded ad ended. 'earned' only after the network's own reward callback; 'skipped': it was on screen but
 * closed before the reward; 'failed': it never started (not loaded, failed to show, no consent, timed out).
 */
export type RewardOutcome = 'earned' | 'skipped' | 'failed';

/** One implementation per ad network. All methods resolve; none throw. */
export interface AdService {
  readonly name: string;
  init(): Promise<void>;
  /** A rewarded ad can be shown now (for this placement, where a network loads per placement). */
  isRewardedReady(p?: Placement): boolean;
  showRewarded(p: Placement): Promise<RewardOutcome>;
  /** Resolves true only when an interstitial was actually shown. */
  showInterstitial(kind: BreakKind): Promise<boolean>;
  readonly privacyOptionsAvailable: boolean;
  showPrivacyOptions?(): Promise<void>;
  /** The app is back in the foreground (e.g. retry a consent update that failed offline). */
  foreground?(): void;
  /** A full-screen ad is on screen right now: the manager's give-up timer waits much longer. */
  adOnScreen?(): boolean;
  /** The manager gave up on the current ad: settle it as failed; anything the network reports later changes nothing. */
  cancel?(): void;
}
