// EdgeFlash: the screen-edge alert for crossing the speed line
// (SPEC M2-O3). A fixed ring over the whole viewport flashes once per alert
// tick. It is pointer-events-none and touches no layout, so the M1-O8
// rolling readout is untouched. Under prefers-reduced-motion the flash
// becomes a static ring for its 700 ms — the alert still lands, without the
// animation.

import { useEffect, useState } from 'react';

/** How long one flash stays on screen. Short and thin: a glance, not a strobe. */
export const FLASH_MS = 700;

interface Props {
  /** Bumped once per alert tick; a new key replays the flash. */
  flashKey: number;
}

export function EdgeFlash({ flashKey }: Props) {
  const [shownKey, setShownKey] = useState(0);

  useEffect(() => {
    if (flashKey === 0) return;
    setShownKey(flashKey);
    const t = setTimeout(() => setShownKey(0), FLASH_MS);
    return () => clearTimeout(t);
  }, [flashKey]);

  if (shownKey === 0) return null;

  return (
    <div
      key={shownKey}
      className="edge-flash pointer-events-none fixed inset-0 z-50"
      aria-hidden="true"
      data-testid="edge-flash"
    />
  );
}
