// Toggle bar: unit switch (km/h <-> mph) and Drive/HUD mode switch, split
// into two designed controls (SPEC M2-O7). The mode switch is the primary
// one — full width, active side as a solid pill — and the unit switch is the
// quiet companion in the header. Both are >=44px and fit at 320px.

import { SpeedViewModel } from '../state/useSpeed';

interface Props {
  vm: SpeedViewModel;
  /** 'unit' = the quiet header switch; 'mode' = the full-width primary switch. */
  variant: 'unit' | 'mode';
}

interface SegOpt {
  id: string;
  label: string;
}

export function ToggleBar({ vm, variant }: Props) {
  if (variant === 'unit') {
    return (
      <Segmented
        options={[
          { id: 'kmh', label: 'km/h' },
          { id: 'mph', label: 'mph' },
        ]}
        active={vm.unit}
        onSelect={(id) => vm.setUnit(id as 'kmh' | 'mph')}
        testId="unit-toggle"
        size="compact"
      />
    );
  }
  return (
    <Segmented
      options={[
        { id: 'drive', label: 'Drive' },
        { id: 'hud', label: 'HUD' },
      ]}
      active={vm.mode}
      onSelect={(id) => vm.setMode(id as 'drive' | 'hud')}
      testId="mode-toggle"
      size="full"
    />
  );
}

const SHELL =
  'inline-flex items-center gap-1 rounded-full border border-[var(--dd-border)] bg-[var(--dd-surface)] p-1';

function Segmented({
  options,
  active,
  onSelect,
  testId,
  size,
}: {
  options: SegOpt[];
  active: string;
  onSelect: (id: string) => void;
  testId: string;
  size: 'compact' | 'full';
}) {
  const full = size === 'full';
  return (
    <div className={SHELL} role="group" data-testid={testId}>
      {options.map((o) => {
        const isActive = active === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            aria-pressed={isActive}
            className={`min-h-11 rounded-full font-semibold transition-colors duration-150 ${
              full ? 'flex-1 px-6 text-sm' : 'min-w-16 px-4 text-xs'
            } ${
              isActive
                ? full
                  ? 'bg-[var(--dd-text-1)] text-[var(--dd-bg)]'
                  : 'bg-[var(--dd-surface-2)] text-[var(--dd-text-1)]'
                : 'text-[var(--dd-text-2)]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
