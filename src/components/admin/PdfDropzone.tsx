import { useRef, useState } from "react";
import { FileText, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PdfState {
  name: string;
  size: number;
  pages: number | null;
  status: "inspecting" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

/** Validates that a file is a real PDF (MIME/extension + %PDF magic bytes) within the size limit. */
export async function validatePdfFile(file: File, maxMb: number): Promise<string | null> {
  const looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksPdf) return "Only PDF files are supported.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > maxMb * 1024 * 1024) return `This file is ${formatBytes(file.size)}. The maximum size is ${maxMb} MB.`;
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = String.fromCharCode(...head);
  if (!text.includes("%PDF-")) return "This file doesn't look like a valid PDF.";
  return null;
}

export function PdfDropzone({
  state,
  maxMb,
  onFile,
  onRemove,
  disabled,
}: {
  state: PdfState | null;
  maxMb: number;
  onFile: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = () => input.current?.click();
  const busy = state?.status === "inspecting" || state?.status === "uploading";

  const hidden = (
    <input
      ref={input}
      type="file"
      accept="application/pdf,.pdf"
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = "";
      }}
    />
  );

  if (state && state.status !== "error") {
    return (
      <div className="rounded-lg border border-line bg-admin-bg/60 p-4">
        {hidden}
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-danger-soft text-danger">
            <FileText className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-ink">{state.name}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {formatBytes(state.size)}
              {state.pages ? ` · ${state.pages} pages detected` : ""}
              {state.status === "inspecting" && " · Reading PDF…"}
              {state.status === "uploading" && ` · Uploading ${Math.round(state.progress * 100)}%`}
              {state.status === "done" && <span className="text-success"> · Uploaded</span>}
            </p>
            {busy && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuenow={Math.round(state.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                <div className={cn("h-full rounded-full bg-primary transition-[width] duration-200", state.status === "inspecting" && "w-1/4 animate-pulse")} style={state.status === "uploading" ? { width: `${Math.max(4, state.progress * 100)}%` } : undefined} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="outline" size="sm" onClick={pick} disabled={busy || disabled}>
              <RefreshCw /> Replace
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} disabled={busy || disabled} aria-label="Remove PDF">
              <Trash2 />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {hidden}
      <div
        role="button"
        tabIndex={0}
        onClick={pick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
          drag ? "border-primary bg-primary/[0.03]" : "border-line-strong bg-admin-bg/50 hover:border-[#b9bec7] hover:bg-admin-bg",
          state?.status === "error" && "border-danger/50",
        )}
      >
        <div className="grid size-12 place-items-center rounded-full bg-surface shadow-sm">
          <UploadCloud className="size-5 text-primary" />
        </div>
        <p className="mt-4 text-[14px] font-medium text-ink">
          Drag & drop a PDF here, or <span className="text-primary underline underline-offset-2">browse</span>
        </p>
        <p className="mt-1 text-[12.5px] text-muted">PDF only · Maximum {maxMb} MB</p>
      </div>
      {state?.status === "error" && <p role="alert" className="mt-2 text-[12.5px] text-danger">{state.error}</p>}
    </div>
  );
}
