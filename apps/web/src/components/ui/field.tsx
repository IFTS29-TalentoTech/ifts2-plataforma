'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown } from 'lucide-react';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * Campos de formulario accesibles: etiqueta visible, ayuda y error asociados con aria-describedby.
 * El error nunca se comunica solo con color (lleva icono de texto "Error:" para lectores).
 */
interface ShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  children: ReactNode;
  className?: string;
}

function firstError(error?: string | string[]) {
  return Array.isArray(error) ? error[0] : error;
}

export function FieldShell({ id, label, hint, error, required, children, className }: ShellProps) {
  const msg = firstError(error);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-accent-3">
        {label}
        {required && (
          <span className="text-danger-text" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !msg && (
        <p id={`${id}-hint`} className="text-xs text-font-strong">
          {hint}
        </p>
      )}
      {msg && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-text">
          <span className="sr-only">Error: </span>
          {msg}
        </p>
      )}
    </div>
  );
}

const control =
  'w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-accent-3 placeholder:text-font-strong ' +
  'focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:bg-base';

function describedBy(id: string, hint?: ReactNode, error?: string | string[]) {
  if (firstError(error)) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

type CommonProps = { label: ReactNode; hint?: ReactNode; error?: string | string[] };

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & CommonProps
>(function Input({ label, hint, error, required, className, id, ...props }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell
      id={fid}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <input
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={!!firstError(error) || undefined}
        aria-describedby={describedBy(fid, hint, error)}
        className={cn(control, firstError(error) ? 'border-danger-text' : 'border-primary')}
        {...props}
      />
    </FieldShell>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & CommonProps
>(function Textarea({ label, hint, error, required, className, id, rows = 4, ...props }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell
      id={fid}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        required={required}
        aria-invalid={!!firstError(error) || undefined}
        aria-describedby={describedBy(fid, hint, error)}
        className={cn(
          control,
          'resize-y',
          firstError(error) ? 'border-danger-text' : 'border-primary',
        )}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends CommonProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** Select de Radix (teclado y lectores de pantalla). Radix no admite value="" en los ítems. */
export function Select({
  label,
  hint,
  error,
  options,
  placeholder = 'Elegí una opción',
  required,
  className,
  id,
  ...props
}: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell
      id={fid}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <SelectPrimitive.Root required={required} {...props}>
        <SelectPrimitive.Trigger
          id={fid}
          aria-invalid={!!firstError(error) || undefined}
          aria-describedby={describedBy(fid, hint, error)}
          className={cn(
            control,
            'flex items-center justify-between gap-2 text-left data-[placeholder]:text-font-strong',
            firstError(error) ? 'border-danger-text' : 'border-primary',
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-accent-2 bg-surface shadow-popover"
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value}
                  value={o.value}
                  className="flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-sm text-accent-3 outline-none data-[highlighted]:bg-accent-2"
                >
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </FieldShell>
  );
}

export interface CheckboxProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[];
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Checkbox({ label, hint, error, className, id, required, ...props }: CheckboxProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <CheckboxPrimitive.Root
          id={fid}
          required={required}
          aria-describedby={describedBy(fid, hint, error)}
          aria-invalid={!!firstError(error) || undefined}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border bg-surface',
            'focus-visible:outline-none focus-visible:shadow-focus data-[state=checked]:bg-primary-strong',
            firstError(error) ? 'border-danger-text' : 'border-primary-strong',
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator>
            <Check className="h-3.5 w-3.5 text-surface" aria-hidden="true" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        <label htmlFor={fid} className="text-sm text-accent-3">
          {label}
        </label>
      </div>
      {hint && !firstError(error) && (
        <p id={`${fid}-hint`} className="pl-8 text-xs text-font-strong">
          {hint}
        </p>
      )}
      {firstError(error) && (
        <p id={`${fid}-error`} role="alert" className="pl-8 text-sm font-medium text-danger-text">
          <span className="sr-only">Error: </span>
          {firstError(error)}
        </p>
      )}
    </div>
  );
}

export interface SwitchProps {
  label: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** Interruptor ("Inscripciones a mesas SIU habilitadas"). El estado también se anuncia con texto. */
export function Switch({
  label,
  hint,
  className,
  id,
  checked,
  defaultChecked,
  ...props
}: SwitchProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex flex-col">
        <label htmlFor={fid} className="text-sm font-semibold text-accent-3">
          {label}
        </label>
        {hint && (
          <p id={`${fid}-hint`} className="text-xs text-font-strong">
            {hint}
          </p>
        )}
      </div>
      <SwitchPrimitive.Root
        id={fid}
        checked={checked}
        defaultChecked={defaultChecked}
        aria-describedby={hint ? `${fid}-hint` : undefined}
        className="relative h-6 w-11 shrink-0 rounded-pill bg-font-strong focus-visible:outline-none focus-visible:shadow-focus data-[state=checked]:bg-primary-strong"
        {...props}
      >
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-pill bg-surface transition-transform data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}
