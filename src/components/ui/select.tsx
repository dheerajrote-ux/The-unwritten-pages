import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: React.ReactNode;
}

/** Thin wrapper around Radix Select. Use value "" for "none". */
export const Select = React.forwardRef<
  HTMLButtonElement,
  {
    value: string;
    onValueChange: (v: string) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
    id?: string;
    disabled?: boolean;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    "aria-label"?: string;
    size?: "sm" | "md";
  }
>(({ value, onValueChange, options, placeholder, className, size = "md", ...rest }, ref) => {
  const NONE = "__none__";
  return (
    <SelectPrimitive.Root value={value === "" ? NONE : value} onValueChange={(v) => onValueChange(v === NONE ? "" : v)} disabled={rest.disabled}>
      <SelectPrimitive.Trigger
        ref={ref}
        id={rest.id}
        aria-invalid={rest["aria-invalid"]}
        aria-describedby={rest["aria-describedby"]}
        aria-label={rest["aria-label"]}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/10 aria-[invalid=true]:border-danger data-[placeholder]:text-[#9aa3af]",
          size === "sm" ? "h-9" : "h-10",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-surface shadow-lg data-[state=open]:animate-fade-in">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value || NONE}
                value={o.value === "" ? NONE : o.value}
                className="relative flex cursor-pointer select-none items-center rounded-[5px] py-2 pl-8 pr-3 text-sm text-ink outline-none data-[highlighted]:bg-black/[0.05]"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5">
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});
Select.displayName = "Select";
