import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  onValueChange?: (value: number[]) => void;
}

export function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  onValueChange,
}: SliderProps) {
  const [internalValue, setInternalValue] = React.useState<number[]>(defaultValue || value || [min]);
  const current = value ?? internalValue;

  React.useEffect(() => {
    if (value) {
      setInternalValue(value);
    }
  }, [value]);

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={current[0] ?? min}
      className={cn('w-full accent-primary', className)}
      onChange={(event) => {
        const next = [Number(event.target.value)];
        setInternalValue(next);
        onValueChange?.(next);
      }}
    />
  );
}