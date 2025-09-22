import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DialogContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}
const DialogContext = React.createContext<DialogContextValue | null>(null);

interface RootProps { open?: boolean; onOpenChange?: (v: boolean)=>void; children: React.ReactNode; }
export const Dialog = ({ open: controlledOpen, onOpenChange, children }: RootProps) => {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolled;
  const setOpen = (v: boolean) => { if (!isControlled) setUncontrolled(v); onOpenChange?.(v); };
  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>;
};

export const DialogTrigger: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => {
  const ctx = React.useContext(DialogContext)!;
  return <button type="button" {...props} onClick={(e)=>{ props.onClick?.(e); ctx.setOpen(true); }}>{children}</button>;
};

const DialogPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

export const DialogContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => {
  const ctx = React.useContext(DialogContext)!;
  if (!ctx.open) return null;
  return (
    <DialogPortal>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={()=>ctx.setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn('fixed z-50 top-1/2 left-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg focus:outline-none', className)}
        {...props}
      >
        {children}
      </div>
    </DialogPortal>
  );
};

export const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);

export const DialogTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...props }) => (
  <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
);

export const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4', className)} {...props} />
);

export const DialogClose: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => {
  const ctx = React.useContext(DialogContext)!;
  return <button type="button" {...props} onClick={(e: React.MouseEvent<HTMLButtonElement>)=>{ props.onClick?.(e); ctx.setOpen(false); }}>{children}</button>;
};
