// App: picks the SpeedSource / ScreenLock implementations and renders the
// active mode from the single data layer. In a browser (dev/PWA) it falls back
// to the WebScreenLock; the SpeedSource is chosen by the caller in main.tsx.

import { useSpeed, SpeedViewModel } from './state/useSpeed';
import { ScreenLock } from './platform/ScreenLock';
import { SpeedSource } from './platform/SpeedSource';
import { TripStore } from './platform/TripStore';
import { DriveMode } from './components/DriveMode';
import { HudMode } from './components/HudMode';

interface AppProps {
  source: SpeedSource;
  screenLock: ScreenLock;
  tripStore: TripStore;
}

export function App({ source, screenLock, tripStore }: AppProps) {
  const vm: SpeedViewModel = useSpeed(source, screenLock, tripStore);
  return vm.mode === 'hud' ? <HudMode vm={vm} /> : <DriveMode vm={vm} />;
}
