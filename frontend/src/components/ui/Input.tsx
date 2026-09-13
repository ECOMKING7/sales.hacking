import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Maydon ostida chiqadigan izoh */
  hint?: string;
  /** Xato matni — hint o'rniga chiqadi va ramkani qizartiradi */
  error?: string;
  /** Maydon ichida, chapda turadigan ikonka */
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;
  const message = error ?? hint;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-semibold text-ink-2"
        >
          {label}
        </label>
      )}

      <div className="relative">
        {icon && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? descId : undefined}
          className={cn(
            'h-10 w-full rounded-sm border-[1.5px] bg-surface px-3.5 text-sm text-ink',
            'placeholder:text-ink-3',
            'transition-[box-shadow,border-color] duration-200',
            'focus:border-edge focus:shadow-glow-md focus:outline-none focus:ring-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            icon && 'pl-10',
            error ? 'border-bad' : 'border-line-2',
            className
          )}
          {...rest}
        />
      </div>

      {message && (
        <p
          id={descId}
          className={cn('mt-1.5 text-xs', error ? 'text-bad' : 'text-ink-3')}
        >
          {message}
        </p>
      )}
    </div>
  );
});
