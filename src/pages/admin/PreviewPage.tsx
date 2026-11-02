import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Monitor, Pencil, Smartphone } from "lucide-react";
import { api } from "@/data";
import { useAsync } from "@/hooks/useAsync";
import { PdfReader } from "@/components/reader/PdfReader";
import { Button } from "@/components/ui/button";
import { ErrorState, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { StatusBadge } from "@/components/admin/bits";

export function PreviewPage() {
  const { id = "" } = useParams();
  const { data: pub, error, loading } = useAsync(() => api.getAdminPublication(id), [id]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  if (error) return <ErrorState message={error} />;
  if (loading) return <div className="skeleton h-[70vh]" />;
  if (!pub) return <ErrorState message="Publication not found." />;
  if (!pub.pdf_storage_path) return <ErrorState message="This publication has no PDF yet." />;
  const load = () => api.getAdminPdfSource(pub.pdf_storage_path!);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/admin/publications" className="grid size-9 place-items-center rounded-md text-secondary hover:bg-black/5" aria-label="Back"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-semibold text-ink">{pub.title}</h1>
          <StatusBadge status={pub.status} publishedAt={pub.published_at} />
        </div>
        <Tabs value={device} onValueChange={(v) => setDevice(v as "desktop" | "mobile")}>
          <TabsList>
            <TabsTrigger value="desktop"><Monitor className="mr-1.5 inline size-3.5" />Desktop</TabsTrigger>
            <TabsTrigger value="mobile"><Smartphone className="mr-1.5 inline size-3.5" />Mobile</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button asChild variant="outline"><Link to={`/admin/publications/${pub.id}/edit`}><Pencil /> Edit</Link></Button>
      </div>
      <div className="flex justify-center overflow-hidden rounded-xl border border-line bg-admin-bg">
        {device === "desktop" ? (
          <PdfReader key="d" sourceKey={pub.pdf_storage_path} loadSource={load} settings={pub.settings} title={pub.title} className="h-[calc(100dvh-220px)] min-h-[520px] w-full" />
        ) : (
          <div className="my-6 flex h-[760px] w-[390px] max-w-full flex-col overflow-hidden rounded-[28px] border-[6px] border-[#1b2230] bg-paper shadow-2xl">
            <div className="flex h-11 shrink-0 items-center justify-center border-b border-line px-4 text-[13px] font-medium text-ink"><span className="truncate">{pub.title}</span></div>
            <PdfReader key="m" sourceKey={pub.pdf_storage_path} loadSource={load} settings={pub.settings} title={pub.title} forceSingle className="flex-1" />
          </div>
        )}
      </div>
    </div>
  );
}
