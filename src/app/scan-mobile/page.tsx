"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function ScanMobileContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const handleCapture = async (file: File) => {
    if (!sessionId) return;
    setUploading(true);
    setError("");
    try {
      // The phone is a different physical device from whatever machine runs the
      // backend -- NEXT_PUBLIC_API_BASE_URL (typically "localhost:8000" for normal
      // desktop dev) would resolve to the phone's own loopback, not the computer's.
      // The page was reached by scanning a QR code built from the desktop's own LAN
      // address, so that same host, paired with the backend's known port, is the one
      // address guaranteed to reach it from here.
      const backendBase = `${window.location.protocol}//${window.location.hostname}:8000`;
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch(`${backendBase}/api/v1/organize/scan-session/${sessionId}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const body: { totalPages: number } = await response.json();
      setUploadedCount(body.totalPages);
      setThumbnails((prev) => [...prev, URL.createObjectURL(file)]);
    } catch {
      setError(t("mobile.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  if (!sessionId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900 px-6 text-center">
        <p className="text-red-400">{t("mobile.invalidSession")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-900 px-6 py-10 text-white">
      <h1 className="text-xl font-semibold">{t("mobile.title")}</h1>
      <p className="mt-1 text-sm text-gray-400">
        {uploadedCount === 0 ? t("mobile.subtitleNoPages") : `${uploadedCount} ${t("mobile.subtitlePagesSent")}`}
      </p>

      <label className="mt-10 flex cursor-pointer flex-col items-center active:scale-95">
        <span className={`flex h-28 w-28 items-center justify-center rounded-full shadow-lg ${uploading ? "bg-gray-700" : "bg-maroon"}`}>
          <Camera className="h-12 w-12" />
        </span>
        <span className="mt-3 text-sm font-medium text-gray-200">{uploading ? t("mobile.sending") : t("mobile.tapToCapture")}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleCapture(file);
            e.target.value = "";
          }}
        />
      </label>

      {error && <p className="mt-6 max-w-xs text-center text-sm text-red-400">{error}</p>}

      {thumbnails.length > 0 && (
        <div className="mt-8 grid w-full max-w-xs grid-cols-4 gap-2">
          {thumbnails.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL, not a static/remote asset
            <img key={i} src={src} alt="" className="aspect-[3/4] w-full rounded object-cover" />
          ))}
        </div>
      )}

      <p className="mt-10 max-w-xs text-center text-xs text-gray-500">{t("mobile.instructions")}</p>
    </main>
  );
}

export default function ScanMobilePage() {
  return (
    <Suspense>
      <ScanMobileContent />
    </Suspense>
  );
}
