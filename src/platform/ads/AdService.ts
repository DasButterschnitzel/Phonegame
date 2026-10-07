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

/** One implementation per ad network. All methods resolve; none throw. */
export interface AdService {
  readonly name: string;
  init(): Promise<void>;
  isRewardedReady(): boolean;
  /** Resolves true only when the reward was earned. */
  showRewarded(p: Placement): Promise<boolean>;
  showInterstitial(kind: BreakKind): Promise<void>;
  readonly privacyOptionsAvailable: boolean;
  showPrivacyOptions?(): Promise<void>;
}
