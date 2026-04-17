"use client";

import NextImage from "next/image";
import { Button } from "@/components/ui/button";
import { FileText, X } from "lucide-react";

type Variant = "expense" | "income";

interface CapturedPreviewProps {
  /** Blob URL of the captured image (ignored when isPdf is true) */
  src: string;
  /** Whether the source is a PDF */
  isPdf: boolean;
  /** Called when the user clears the preview */
  onClear: () => void;
  /** Visual layout — expense shows a full preview image, income shows a compact badge */
  variant?: Variant;
}

/**
 * Shows a preview of the just-captured receipt/income statement with a
 * clear (X) button. Two layouts exist for expense vs. income (the income
 * form only shows a small confirmation badge because the scan result is
 * already injected into fields).
 */
export function CapturedPreview({
  src,
  isPdf,
  onClear,
  variant = "expense",
}: CapturedPreviewProps) {
  if (variant === "income") {
    return (
      <div className="relative">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-green-900/20 border border-green-700/30">
          {isPdf ? (
            <FileText className="h-5 w-5 text-green-400" />
          ) : (
            <NextImage
              src={src}
              alt="給与明細"
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 object-cover rounded"
            />
          )}
          <span className="text-xs text-green-300 flex-1">
            {isPdf ? "PDF解析済み" : "画像解析済み"} ✓
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-purple-200 dark:border-purple-800 shadow-lg">
      {isPdf ? (
        <div className="flex items-center justify-center gap-2 p-6 bg-slate-100 dark:bg-slate-800">
          <FileText className="h-10 w-10 text-red-500" />
          <span className="text-sm font-semibold">PDFファイル</span>
        </div>
      ) : (
        <NextImage
          src={src}
          alt="撮影したレシート"
          width={1200}
          height={1600}
          unoptimized
          className="w-full h-auto"
        />
      )}
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="absolute top-2 right-2 rounded-full h-7 w-7 p-0"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
