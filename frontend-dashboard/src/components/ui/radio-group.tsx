import * as React from 'react';
import { cn } from '@/lib/utils';

type RadioGroupContextValue = {
  name?: string;
  value?: string;
  onValueChange?: (value: string) => void;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue>({});

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, name, children, ...props }, ref) => {
    const generatedName = React.useId();

    return (
      <RadioGroupContext.Provider
        value={{
          name: name || generatedName,
          value,
          onValueChange,
        }}
      >
        <div ref={ref} role="radiogroup" className={cn('grid gap-2', className)} {...props}>
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = 'RadioGroup';

interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const { name, value: selectedValue, onValueChange } = React.useContext(RadioGroupContext);
    const checked = selectedValue === value;

    return (
      <input
        ref={ref}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn('peer', className)}
        onChange={(event) => {
          onValueChange?.(event.target.value);
          onChange?.(event);
        }}
        {...props}
      />
    );
  }
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };