import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <label className={cn('inline-flex items-center gap-2 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className)}>
        <input
          type="checkbox"
          ref={ref}
          className="peer sr-only"
          checked={!!checked}
          disabled={disabled}
          onChange={e => onCheckedChange?.(e.target.checked)}
          {...props}
        />
        <span className={cn('h-5 w-9 rounded-full bg-muted relative transition-colors peer-checked:bg-primary')}></span>
        <span className="absolute w-4 h-4 rounded-full bg-background shadow transform transition-transform peer-checked:translate-x-4 translate-x-0 ml-1" />
      </label>
    );
  }
);
Switch.displayName = 'Switch';
