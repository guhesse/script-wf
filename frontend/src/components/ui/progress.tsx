import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div
        ref={ref}
        data-slot="progress"
        className={cn('relative h-2 w-full overflow-hidden rounded bg-muted', className)}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-primary transition-[width] duration-300 ease-out"
          style={{ width: pct + '%' }}
        />
      </div>
    );
  }
);
Progress.displayName = 'Progress';
