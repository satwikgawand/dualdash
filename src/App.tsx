// App: picks the SpeedSource / ScreenLock implementations and renders the
// active mode from the single data layer. In a browser (dev/PWA) it falls back
// to the WebScreenLock; the SpeedSource is chosen by the caller in main.tsx.
// No persistence is wired here: the app is realtime-only (SPEC M1-O5).

import { useSpeed, SpeedViewModel } from './state/useSpeed';
import { ScreenLock } from './platform/ScreenLock';
import { SpeedSource } from './platform/SpeedSource';
import { DriveMode } from './components/DriveMode';
import { HudMode } from './components/HudMode';

interface AppProps {
  source: SpeedSource;
  screenLock: ScreenLock;
}

export function App({ source, screenLock }: AppProps) {
  const vm: SpeedViewModel = useSpeed(source, screenLock);
  return vm.mode === 'hud' ? <HudMode vm={vm} /> : <DriveMode vm={vm} />;
}
