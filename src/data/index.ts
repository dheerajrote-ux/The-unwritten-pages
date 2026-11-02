import type { DataApi } from "./api";
import { DATA_MODE } from "@/lib/config";
import { DemoApi } from "./demo-api";
import { SupabaseApi } from "./supabase-api";

export const api: DataApi = DATA_MODE === "demo" ? new DemoApi() : new SupabaseApi();
export const isDemo = api.mode === "demo";
export type { DataApi };
