import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={6} align="end" className={cn("z-50 min-w-44 rounded-md border border-line bg-surface p-1 shadow-lg data-[state=open]:animate-fade-in", className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof DM.Item> & { danger?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-[13px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted",
        danger ? "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger" : "text-ink data-[highlighted]:bg-black/[0.05]",
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}
