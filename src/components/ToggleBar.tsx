// Toggle bar: unit switch (km/h <-> mph) and Drive/HUD mode switch. Both are
// >=44px and sit in a horizontally-fitting row even at 320px.

import { SpeedViewModel } from '../state/useSpeed';

export function ToggleBar({ vm }: { vm: SpeedViewModel }) {
  return (
    <div className="flex w-full items-center justify-between gap-2" data-testid="toggle-bar">
      <Segmented
        options={[
          { id: 'kmh', label: 'km/h' },
          { id: 'mph', label: 'mph' },
        ]}
        active={vm.unit}
        onSelect={(id) => vm.setUnit(id as 'kmh' | 'mph')}
        testId="unit-toggle"
      />
      <Segmented
        options={[
          { id: 'drive', label: 'Drive' },
          { id: 'hud', label: 'HUD' },
        ]}
        active={vm.mode}
        onSelect={(id) => vm.setMode(id as 'drive' | 'hud')}
        testId="mode-toggle"
      />
    </div>
  );
}

interface SegOpt {
  id: string;
  label: string;
}

function Segmented({
  options,
  active,
  onSelect,
  testId,
}: {
  options: SegOpt[];
  active: string;
  onSelect: (id: string) => void;
  testId: string;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-full bg-neutral-800"
      role="group"
      data-testid={testId}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect(o.id)}
          aria-pressed={active === o.id}
          className={`min-h-11 min-w-16 px-4 text-sm font-semibold ${
            active === o.id ? 'bg-emerald-600 text-white' : 'text-neutral-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
