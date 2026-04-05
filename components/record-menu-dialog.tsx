"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp, PiggyBank } from "lucide-react";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

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
  const { assets: charAssets, isActive: charActive, themeColors: charColors } = useCharacter();

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-slate-900/95 backdrop-blur-xl border-slate-700 overflow-hidden">
        {/* キャラ装飾 */}
        {charActive && charAssets && charColors && (
          <>
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{
                border: `1.5px solid ${charColors.navGlow}`,
                boxShadow: `inset 0 0 30px ${charColors.cardAccent}`,
              }}
            />
            <div className="absolute -right-4 -top-4 opacity-15 pointer-events-none rotate-12">
              <CharacterImage
                src={charAssets.avatar}
                alt=""
                width={90}
                height={90}
                className="select-none"
                fallback={null}
              />
            </div>
          </>
        )}

        <DialogHeader className="relative">
          <DialogTitle className="text-white text-center text-xl">記録する項目を選択</DialogTitle>
          <DialogDescription className="text-center text-gray-400">
            記録したい項目を選んでください
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5 py-3 relative">
          {/* 支出ボタン */}
          <Button
            onClick={() => handleSelect(onSelectExpense)}
            variant="outline"
            className="h-16 bg-slate-800/60 border-slate-600/50 hover:bg-slate-700/60 hover:border-red-500/40 text-white transition-all justify-start px-4"
            style={charActive && charColors ? { borderColor: `${charColors.navGlow}` } : {}}
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center overflow-hidden">
                {charAssets?.menuExpense ? (
                  <CharacterImage src={charAssets.menuExpense} alt="支出" width={32} height={32} className="object-contain" fallback={<TrendingDown className="h-6 w-6 text-red-400" />} />
                ) : (
                  <TrendingDown className="h-6 w-6 text-red-400" />
                )}
              </div>
              <span className="text-base font-semibold">支出を記録</span>
            </div>
          </Button>

          {/* 収入ボタン */}
          <Button
            onClick={() => handleSelect(onSelectIncome)}
            variant="outline"
            className="h-16 bg-slate-800/60 border-slate-600/50 hover:bg-slate-700/60 hover:border-emerald-500/40 text-white transition-all justify-start px-4"
            style={charActive && charColors ? { borderColor: `${charColors.navGlow}` } : {}}
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center overflow-hidden">
                {charAssets?.menuIncome ? (
                  <CharacterImage src={charAssets.menuIncome} alt="収入" width={32} height={32} className="object-contain" fallback={<TrendingUp className="h-6 w-6 text-emerald-400" />} />
                ) : (
                  <TrendingUp className="h-6 w-6 text-emerald-400" />
                )}
              </div>
              <span className="text-base font-semibold">収入を記録</span>
            </div>
          </Button>

          {/* 貯金ボタン */}
          <Button
            onClick={() => handleSelect(onSelectSaving)}
            variant="outline"
            className="h-16 bg-slate-800/60 border-slate-600/50 hover:bg-slate-700/60 hover:border-purple-500/40 text-white transition-all justify-start px-4"
            style={charActive && charColors ? { borderColor: `${charColors.navGlow}` } : {}}
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-purple-500/15 flex items-center justify-center overflow-hidden">
                {charAssets?.menuSavings ? (
                  <CharacterImage src={charAssets.menuSavings} alt="貯金" width={32} height={32} className="object-contain" fallback={<PiggyBank className="h-6 w-6 text-purple-400" />} />
                ) : (
                  <PiggyBank className="h-6 w-6 text-purple-400" />
                )}
              </div>
              <span className="text-base font-semibold">貯金に入金</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
