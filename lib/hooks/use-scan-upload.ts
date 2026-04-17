"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  compressScannableFile,
  detectUploadMimeType,
  shouldUseDirectAnalysisUpload,
} from "@/lib/scan-upload";
import { showPerfToast, logPerf } from "@/lib/perf-toast";
import type { PerfRecord } from "@/lib/gemini";

/**
 * Minimal shape expected from the scan API. Each endpoint returns its
 * own richer result type; the hook just needs `_perf` for timing toasts.
 */
export interface ScanApiResponse {
  _perf?: PerfRecord;
}

export type ScanStage = "idle" | "uploading" | "analyzing";

interface UseScanUploadOptions<TResult extends ScanApiResponse> {
  /** API endpoint path, e.g. `/api/receipt` or `/api/income-scan` */
  endpoint: string;
  /** Label used for perf logging and toast display */
  perfLabel: string;
  /** Called with the parsed result when the analysis succeeds */
  onSuccess: (result: TResult) => void;
  /** Human-readable name for error alerts, e.g. "レシート" */
  label: string;
}

interface UseScanUploadReturn {
  /** True while the overlay should be shown */
  isAnalyzing: boolean;
  /** Which stage of the pipeline we're in */
  stage: ScanStage;
  /** Blob URL of the captured file (null when not scanning) */
  capturedImage: string | null;
  /** Whether the captured file is a PDF */
  isPdf: boolean;
  /** Hidden <input type="file"> ref for the native camera */
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  /** Hidden <input type="file"> ref for files/PDFs */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Camera input change handler */
  onCameraChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** File input change handler */
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Clears the preview (e.g. via the X button) */
  clearCaptured: () => void;
  /** Imperatively clicks the camera button (used by continuous scan mode) */
  openCamera: () => void;
}

async function uploadToStorage(
  file: File,
): Promise<{ path: string; mimeType: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("認証が必要です");

  const userId = session.user.id;
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${userId}/${Date.now()}.${ext}`;
  const contentType = detectUploadMimeType(file);

  const { error } = await supabase.storage
    .from("receipt-images")
    .upload(fileName, file, {
      cacheControl: "300",
      upsert: false,
      contentType,
    });

  if (error) {
    throw new Error(`アップロード失敗: ${error.message}`);
  }

  return { path: fileName, mimeType: contentType };
}

/**
 * Shared scan + upload pipeline for the receipt and income dialogs.
 *
 * - Shows an analyzing overlay immediately (before expensive work).
 * - Waits two frames to let React paint before running HEIC decode / compression.
 * - Uses direct multipart POST for small files, Storage + server download for large/PDF.
 * - Parses JSON robustly (alerts on non-JSON responses) and emits perf toasts.
 */
export function useScanUpload<TResult extends ScanApiResponse>({
  endpoint,
  perfLabel,
  onSuccess,
  label,
}: UseScanUploadOptions<TResult>): UseScanUploadReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stage, setStage] = useState<ScanStage>("idle");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke stale blob URLs without requiring an effect — the input
  // handlers replace `capturedImage` themselves, so we track the
  // current URL in a ref to clean up only on dismount / replacement.
  const lastBlobRef = useRef<string | null>(null);

  const replaceBlob = (next: string | null) => {
    if (lastBlobRef.current && lastBlobRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(lastBlobRef.current);
    }
    lastBlobRef.current = next;
    setCapturedImage(next);
  };

  const analyze = async (params: {
    file?: File;
    storagePath?: string;
    mimeType: string;
  }) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      let response: Response;
      if (params.file) {
        const formData = new FormData();
        formData.append("file", params.file, params.file.name);
        formData.append("mimeType", params.mimeType);
        response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            storagePath: params.storagePath,
            mimeType: params.mimeType,
          }),
        });
      }

      const text = await response.text();
      let result: TResult;
      try {
        result = JSON.parse(text) as TResult;
      } catch {
        console.error(
          `${label}解析APIレスポンスがJSONではありません:`,
          response.status,
          text.substring(0, 200),
        );
        alert("サーバーエラーが発生しました。もう一度お試しください。");
        return;
      }

      if (!response.ok) {
        console.error(`${label}解析APIエラー:`, response.status, result);
        alert(`解析エラー (${response.status}): もう一度お試しください。`);
        return;
      }

      if (result._perf) {
        logPerf(perfLabel, result._perf);
        showPerfToast(`${label}解析`, result._perf.total);
      }

      onSuccess(result);
    } catch (error) {
      console.error(`${label}解析エラー:`, error);
      alert(`${label}の解析に失敗しました。手動で入力してください。`);
    } finally {
      setIsAnalyzing(false);
      setStage("idle");
    }
  };

  const processSelectedFile = async (
    file: File,
    previewUrl: string,
    pdf: boolean,
  ) => {
    // Show the overlay BEFORE heavy work (HEIC decode, canvas compress).
    setIsPdf(pdf);
    setIsAnalyzing(true);
    setStage("uploading");

    // Give React two frames to commit + paint so the overlay appears
    // immediately even though canvas work is synchronous.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    replaceBlob(previewUrl);

    try {
      const prepared = await compressScannableFile(file);
      const mimeType = detectUploadMimeType(prepared);

      if (shouldUseDirectAnalysisUpload(prepared)) {
        setStage("analyzing");
        await analyze({ file: prepared, mimeType });
        return;
      }

      const { path, mimeType: uploadedMimeType } = await uploadToStorage(
        prepared,
      );
      setStage("analyzing");
      await analyze({ storagePath: path, mimeType: uploadedMimeType });
    } catch (err) {
      console.error("ファイル処理エラー:", err);
      alert("ファイルの処理に失敗しました。もう一度お試しください。");
      setIsAnalyzing(false);
      setStage("idle");
    }
  };

  const onCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await processSelectedFile(file, URL.createObjectURL(file), false);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const isFilePdf = file.type === "application/pdf";
    await processSelectedFile(file, URL.createObjectURL(file), isFilePdf);
  };

  const clearCaptured = () => {
    replaceBlob(null);
    setIsPdf(false);
  };

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  return {
    isAnalyzing,
    stage,
    capturedImage,
    isPdf,
    cameraInputRef,
    fileInputRef,
    onCameraChange,
    onFileChange,
    clearCaptured,
    openCamera,
  };
}
