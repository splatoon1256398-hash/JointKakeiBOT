"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp, PiggyBank } from "lucide-react";

interface RecordMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExpense: () => void;
  onSelectIncome: () => void;
  onSelectSaving: () => void;
}

export function RecordMenuDialog({
  open,
  onOpenChange,
  onSelectExpense,
  onSelectIncome,
  onSelectSaving,
}: RecordMenuDialogProps) {
  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-slate-900/95 backdrop-blur-xl border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white text-center text-xl">記録する項目を選択</DialogTitle>
          <DialogDescription className="text-center text-gray-400">
            記録したい項目を選んでください
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {/* 支出ボタン */}
          <Button
            onClick={() => handleSelect(onSelectExpense)}
            className="h-20 bg-gradient-to-br from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex flex-col items-center gap-2">
              <TrendingDown className="h-8 w-8" />
              <span className="text-lg font-bold">支出を記録</span>
            </div>
          </Button>

          {/* 収入ボタン */}
          <Button
            onClick={() => handleSelect(onSelectIncome)}
            className="h-20 bg-gradient-to-br from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex flex-col items-center gap-2">
              <TrendingUp className="h-8 w-8" />
              <span className="text-lg font-bold">収入を記録</span>
            </div>
          </Button>

          {/* 貯金ボタン */}
          <Button
            onClick={() => handleSelect(onSelectSaving)}
            className="h-20 bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex flex-col items-center gap-2">
              <PiggyBank className="h-8 w-8" />
              <span className="text-lg font-bold">貯金に入金</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
