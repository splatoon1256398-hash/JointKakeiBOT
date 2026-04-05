"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp, PiggyBank } from "lucide-react";
import { useCharacter } from "@/lib/use-character";
import Image from "next/image";

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
  const { assets: charAssets } = useCharacter();

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

        <div className="grid gap-2.5 py-3">
          {/* 支出ボタン */}
          <Button
            onClick={() => handleSelect(onSelectExpense)}
            variant="outline"
            className="h-14 bg-slate-800/60 border-slate-600/50 hover:bg-slate-700/60 hover:border-red-500/40 text-white transition-all justify-start px-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center overflow-hidden">
                {charAssets?.menuExpense ? (
                  <Image src={charAssets.menuExpense} alt="支出" width={22} height={22} className="object-contain" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                )}
              </div>
              <span className="text-sm font-semibold">支出を記録</span>
            </div>
          </Button>

          {/* 収入ボタン */}
          <Button
            onClick={() => handleSelect(onSelectIncome)}
            variant="outline"
            className="h-14 bg-slate-800/60 border-slate-600/50 hover:bg-slate-700/60 hover:border-emerald-500/40 text-white transition-all justify-start px-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center overflow-hidden">
                {charAssets?.menuIncome ? (
                  <Image src={charAssets.menuIncome} alt="収入" width={22} height={22} className="object-contain" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                )}
              </div>
              <span className="text-sm font-semibold">収入を記録</span>
            </div>
          </Button>

          {/* 貯金ボタン */}
          <Button
            onClick={() => handleSelect(onSelectSaving)}
            variant="outline"
            className="h-14 bg-slate-800/60 border-slate-600/50 hover:bg-slate-700/60 hover:border-purple-500/40 text-white transition-all justify-start px-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center overflow-hidden">
                {charAssets?.menuSavings ? (
                  <Image src={charAssets.menuSavings} alt="貯金" width={22} height={22} className="object-contain" />
                ) : (
                  <PiggyBank className="h-5 w-5 text-purple-400" />
                )}
              </div>
              <span className="text-sm font-semibold">貯金に入金</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
