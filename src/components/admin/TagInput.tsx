import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function TagInput({ id, value, onChange, suggestions = [], placeholder }: { id?: string; value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (!t || value.includes(t) || value.length >= 12) return;
    onChange([...value, t]);
    setText("");
  };
  const matches = text ? suggestions.filter((s) => s.includes(text.toLowerCase()) && !value.includes(s)).slice(0, 6) : [];
  return (
    <div className="relative">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] py-0.5 pl-2.5 pr-1 text-[12.5px] text-primary">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="grid size-4 place-items-center rounded-full hover:bg-primary/10" aria-label={`Remove ${t}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(text)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-[#9aa3af]"
        />
      </div>
      {matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-line bg-surface p-1 shadow-lg">
          {matches.map((m) => (
            <button key={m} type="button" onMouseDown={(e) => { e.preventDefault(); add(m); }} className={cn("block w-full rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[0.05]")}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
