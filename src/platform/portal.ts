import type { KeyValueStore } from './storage/Storage.ts';

/** Extra integration points some web portals require (YouTube Playables, CrazyGames). */
export interface PortalHooks {
  firstFrame(): void;
  gameReady(): void;
  gameplay(active: boolean): void;
  happy(): void;
  store?(): KeyValueStore | undefined;
  /** Portal-driven pause (e.g. YouTube overlay). */
  onPause?(cb: (paused: boolean) => void): void;
  onAudio?(cb: (enabled: boolean) => void): void;
  language?(): Promise<string | null>;
}

export const noPortal: PortalHooks = {
  firstFrame: () => {},
  gameReady: () => {},
  gameplay: () => {},
  happy: () => {},
};
