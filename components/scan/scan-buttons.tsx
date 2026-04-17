"use client";

import { forwardRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload } from "lucide-react";

type Variant = "expense" | "income";

interface ScanButtonsProps {
  /** Ref for the hidden camera input */
  cameraInputRef: RefObject<HTMLInputElement | null>;
  /** Ref for the hidden file (image + pdf) input */
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** Camera file change handler */
  onCameraChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** File picker change handler */
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Visual variant (colors + labels) */
  variant?: Variant;
}

/**
 * Dual buttons for capturing via native camera or picking a file/PDF.
 * Hidden `<input type="file">` elements are co-located so the parent
 * only needs to manage refs.
 */
export const ScanButtons = forwardRef<HTMLDivElement, ScanButtonsProps>(
  function ScanButtons(
    {
      cameraInputRef,
      fileInputRef,
      onCameraChange,
      onFileChange,
      variant = "expense",
    },
    ref,
  ) {
    if (variant === "income") {
      return (
        <div ref={ref} className="flex gap-2">
          <Button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 h-12 text-xs font-bold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white border-0 shadow-lg"
          >
            <Camera className="h-4 w-4 mr-2" />
            📸 給与明細を撮影
          </Button>
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-12 text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 shadow-lg"
          >
            <Upload className="h-4 w-4 mr-2" />
            📄 PDF/画像を選択
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onCameraChange}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      );
    }

    return (
      <div ref={ref} className="grid gap-2 grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-20 border-dashed border-2 hover:border-purple-600 hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50 dark:hover:from-purple-950 dark:hover:to-pink-950 transition-all text-xs"
          onClick={() => cameraInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-1">
            <Camera className="h-6 w-6" />
            <span className="font-semibold">カメラで撮影</span>
          </div>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-20 border-dashed border-2 hover:border-blue-600 hover:bg-gradient-to-br hover:from-blue-50 hover:to-cyan-50 dark:hover:from-blue-950 dark:hover:to-cyan-950 transition-all text-xs"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-1">
            <Upload className="h-6 w-6" />
            <span className="font-semibold">画像 / PDF</span>
          </div>
        </Button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onCameraChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    );
  },
);
