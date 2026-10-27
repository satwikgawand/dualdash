// Entry point. Wires the platform seams. When running under Capacitor
// (Capacitor.isNativePlatform()) we use the device SpeedSource; otherwise the
// mock source keeps the PWA/dev build fully functional.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import { CapacitorSpeedSource } from './platform/capacitorSpeedSource';
import { MockSpeedSource, MockPoint } from './platform/mockSpeedSource';
import { Buzz, HapticsBuzz } from './platform/Buzz';
import {
  CapacitorScreenLock,
  ScreenLock,
  WebScreenLock,
} from './platform/ScreenLock';
import { SpeedSource } from './platform/SpeedSource';
import './index.css';

// A gentle synthetic drive for browser dev: accelerates, cruises through a
// left-hand bend (so the heading tape scrolls in the dev build too), then
// decelerates.
function devTrace(): MockPoint[] {
  const pts: MockPoint[] = [];
  let lat = 12.9716;
  let lon = 77.5946;
  let t = 0;
  // accelerate 0 -> 25 m/s over 25 s
  for (let i = 0; i < 25; i++) {
    pts.push({ tMs: t, speedMps: i, lat, lon, headingDeg: 90 });
    lat += 0.00009;
    t += 1000;
  }
  // cruise 25 m/s for 30 s, turning from east to south-west
  for (let i = 0; i < 30; i++) {
    pts.push({ tMs: t, speedMps: 25, lat, lon, headingDeg: 90 + i * 3 });
    lat += 0.00022;
    t += 1000;
  }
  // decelerate 25 -> 0 over 25 s
  for (let i = 0; i < 25; i++) {
    pts.push({ tMs: t, speedMps: 25 - i, lat, lon, headingDeg: 180 + i });
    lat += 0.00009;
    t += 1000;
  }
  void lon;
  return pts;
}

function pickSource(): SpeedSource {
  if (Capacitor.isNativePlatform()) {
    return new CapacitorSpeedSource();
  }
  return new MockSpeedSource(devTrace());
}

function pickScreenLock(): ScreenLock {
  return Capacitor.isNativePlatform()
    ? new CapacitorScreenLock()
    : new WebScreenLock();
}

// Haptics (SPEC M2-O3): one implementation for both targets — the official
// @capacitor/haptics plugin falls back to navigator.vibrate on the web.
function pickBuzz(): Buzz {
  return new HapticsBuzz();
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App
      source={pickSource()}
      screenLock={pickScreenLock()}
      buzz={pickBuzz()}
    />
  </StrictMode>,
);
