import { useState } from "react";
import { X } from "lucide-react";
import { isDemo } from "@/data";

/** Shown only in demo mode so nobody mistakes seeded activity for real data. */
export function DemoBanner({ admin }: { admin?: boolean }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("dl_demo_banner") === "0";
    } catch {
      return false;
    }
  });
  if (!isDemo || hidden) return null;
  return (
    <div className="relative bg-primary px-10 py-2 text-center text-[12.5px] text-white/85">
      <span className="font-medium text-accent">Demo mode</span> — data is stored in this browser.
      {admin ? " Reader activity, leads and analytics are seeded sample records." : " Connect Supabase to go live."}
      <button
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem("dl_demo_banner", "0");
          } catch {
            /* ignore */
          }
        }}
        className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
