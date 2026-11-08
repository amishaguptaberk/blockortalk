'use client';

import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

export function Pill({ children }: { children: ReactNode }) {
  return <span className="ui-pill">{children}</span>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary';
  large?: boolean;
  sublabel?: string;
};

/** `large` is the verdict-button size: at least 64px tall, with a plain one-line sublabel. */
export function Button({ variant = 'default', large, sublabel, className, children, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cx('ui-button', variant === 'primary' && 'ui-button--primary', large && 'ui-button--large', className)} {...rest}>
    {children}
    {sublabel && <span className="ui-button__sub">{sublabel}</span>}
  </button>;
}

export function Card({ strong, children, className }: { strong?: boolean; children: ReactNode; className?: string }) {
  return <div className={cx('ui-card', strong && 'ui-card--strong', className)}>{children}</div>;
}

/** Big figures (balance, timers, risk readout). Dot-matrix face with system fallback. */
export function DotFigure({ children, size }: { children: ReactNode; size?: string }) {
  return <span className="ui-dot" style={size ? ({ '--dot-size': size } as CSSProperties) : undefined}>{children}</span>;
}

export function Stamp({ children }: { children: ReactNode }) {
  return <span className="ui-stamp">{children}</span>;
}

export function Toast({ children }: { children: ReactNode }) {
  return <div className="ui-toast" role="status">{children}</div>;
}

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="ui-sheet" aria-label={label} onClose={onClose}>{children}</dialog>;
}

/** Wrap each card in the reveal; `index` sets the 60 ms stagger. */
export function Flip({ index = 0, children }: { index?: number; children: ReactNode }) {
  return <div className="ui-flip" style={{ '--i': index } as CSSProperties}>{children}</div>;
}
