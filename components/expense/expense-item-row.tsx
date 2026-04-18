"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { ExpenseItem } from "@/lib/gemini";

interface ExpenseItemRowProps {
  /** The item being edited */
  item: ExpenseItem;
  /** Zero-based display index */
  index: number;
  /** Icon to display for the item's main category */
  icon: string;
  /** Called to update any single field of the item */
  onChange: (field: keyof ExpenseItem, value: string | number) => void;
  /** Called when the user opens the category picker for this row */
  onOpenPicker: () => void;
  /** Called when the user deletes this row (only shown when removable) */
  onRemove?: () => void;
  /** Whether the delete button should be shown */
  removable: boolean;
}

/**
 * A single expense item editor row — category button, store name, amount,
 * memo — shared between the add-expense and edit-transaction dialogs.
 */
export function ExpenseItemRow({
  item,
  index,
  icon,
  onChange,
  onOpenPicker,
  onRemove,
  removable,
}: ExpenseItemRowProps) {
  return (
    <div className="p-3 rounded-lg border bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow hover:shadow-lg transition-all space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-purple-600">#{index + 1}</span>
        <div className="relative flex-1">
          <button
            type="button"
            onClick={onOpenPicker}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-purple-300 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-all text-left"
          >
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-sm">{icon}</span>
              <span className="font-semibold text-slate-800 dark:text-white">
                {item.categoryMain}
              </span>
              <span className="text-slate-400 dark:text-white/30">/</span>
              <span className="text-slate-500 dark:text-white/60">
                {item.categorySub}
              </span>
            </span>
            <span className="text-[10px] text-purple-500 dark:text-purple-400 shrink-0">
              変更 ›
            </span>
          </button>
        </div>
        {removable && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="grid gap-2 grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">店名</Label>
          <Input
            placeholder="スーパー○○"
            value={item.storeName}
            onChange={(e) => onChange("storeName", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">金額 *</Label>
          <Input
            type="number"
            placeholder="1000"
            value={item.amount || ""}
            onChange={(e) => onChange("amount", Number(e.target.value))}
            required
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">メモ</Label>
        <Input
          placeholder="詳細を入力"
          value={item.memo}
          onChange={(e) => onChange("memo", e.target.value)}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}
