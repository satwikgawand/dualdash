// App: picks the SpeedSource / ScreenLock / Buzz / OrientationSource
// implementations and renders the active mode from the single data layer.
// In a browser (dev/PWA) it falls back to the WebScreenLock; the SpeedSource
// is chosen by the caller in main.tsx. The screen-edge flash renders above
// BOTH modes (SPEC M2-O3). No persistence is wired here: the app is
// realtime-only (SPEC M1-O5).

import { useSpeed, SpeedViewModel } from './state/useSpeed';
import { ScreenLock } from './platform/ScreenLock';
import { SpeedSource } from './platform/SpeedSource';
import { OrientationSource } from './platform/orientation';
import { Buzz } from './platform/Buzz';
import { DriveMode } from './components/DriveMode';
import { HudMode } from './components/HudMode';
import { EdgeFlash } from './components/EdgeFlash';

interface AppProps {
  source: SpeedSource;
  screenLock: ScreenLock;
  buzz: Buzz;
  orientation: OrientationSource;
}

export function App({ source, screenLock, buzz, orientation }: AppProps) {
  const vm: SpeedViewModel = useSpeed(source, screenLock, buzz, orientation);
  return (
    <>
      {vm.mode === 'hud' ? <HudMode vm={vm} /> : <DriveMode vm={vm} />}
      <EdgeFlash flashKey={vm.m2.flashKey} />
    </>
  );
}
