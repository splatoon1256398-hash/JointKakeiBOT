"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PiggyBank, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface SavingGoal {
  id: string;
  goal_name: string;
  target_amount: number;
  current_amount: number;
  icon: string;
}

interface AddSavingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSavingDialog({ open, onOpenChange }: AddSavingDialogProps) {
  const { selectedUser, triggerRefresh } = useApp();
  const [isSaving, setIsSaving] = useState(false);
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [memo, setMemo] = useState("");

  const fetchGoals = async () => {
    try {
      const { data } = await supabase
        .from('saving_goals')
        .select('id, goal_name, target_amount, current_amount, icon')
        .eq('user_type', selectedUser)
        .order('created_at', { ascending: false });
      
      setGoals(data || []);
      if (data && data.length > 0 && !selectedGoalId) {
        setSelectedGoalId(data[0].id);
      }
    } catch (error) {
      console.error('目標取得エラー:', error);
    }
  };

  useEffect(() => {
    if (open) {
      fetchGoals();
    }
  }, [open, selectedUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedGoalId || !amount) {
      alert('目標と金額を入力してください');
      return;
    }

    setIsSaving(true);

    try {
      // 現在の目標を取得
      const selectedGoal = goals.find(g => g.id === selectedGoalId);
      if (!selectedGoal) {
        throw new Error('目標が見つかりません');
      }

      // current_amount を更新
      const newAmount = selectedGoal.current_amount + Number(amount);
      
      const { error } = await supabase
        .from('saving_goals')
        .update({ current_amount: newAmount })
        .eq('id', selectedGoalId);

      if (error) {
        console.error('Supabase保存エラー:', error);
        alert(`保存に失敗しました: ${error.message}`);
        return;
      }

      alert(`${selectedGoal.goal_name}に¥${Number(amount).toLocaleString()}を入金しました！`);
      
      // データを即座に反映
      triggerRefresh();
      
      // フォームをリセット
      setAmount("");
      setMemo("");
      fetchGoals(); // 目標リストを再取得
      onOpenChange(false);
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedGoal = goals.find(g => g.id === selectedGoalId);
  const remainingAmount = selectedGoal ? selectedGoal.target_amount - selectedGoal.current_amount : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900/95 backdrop-blur-xl border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <PiggyBank className="h-5 w-5 text-blue-400" />
            貯金に入金 - {selectedUser}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            貯金目標に入金します
          </DialogDescription>
        </DialogHeader>

        {goals.length === 0 ? (
          <div className="py-12 text-center">
            <PiggyBank className="h-16 w-16 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400 mb-4">貯金目標がまだ設定されていません</p>
            <p className="text-sm text-gray-500">「貯金」ページから目標を作成してください</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 貯金目標選択 */}
            <div className="space-y-2">
              <Label className="text-white">貯金目標 *</Label>
              <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {goals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.icon} {goal.goal_name} (残り: ¥{(goal.target_amount - goal.current_amount).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 入金額 */}
            <div className="space-y-2">
              <Label className="text-white">入金額 *</Label>
              <Input
                type="number"
                placeholder="10000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="bg-slate-800/50 border-slate-700 text-white h-12 text-lg"
              />
              {selectedGoal && (
                <p className="text-sm text-gray-400">
                  現在: ¥{selectedGoal.current_amount.toLocaleString()} / 
                  目標: ¥{selectedGoal.target_amount.toLocaleString()} 
                  (残り: ¥{remainingAmount.toLocaleString()})
                </p>
              )}
            </div>

            {/* メモ */}
            <div className="space-y-2">
              <Label className="text-white">メモ</Label>
              <Input
                placeholder="例：給料日に積立"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>

            {/* プレビュー */}
            {amount && selectedGoal && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">入金後の金額</span>
                  <span className="text-xl font-bold text-blue-400">
                    ¥{(selectedGoal.current_amount + Number(amount)).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500 rounded-full"
                      style={{ 
                        width: `${Math.min(((selectedGoal.current_amount + Number(amount)) / selectedGoal.target_amount) * 100, 100)}%` 
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    達成率: {(((selectedGoal.current_amount + Number(amount)) / selectedGoal.target_amount) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            )}

            {/* 送信ボタン */}
            <div className="flex gap-2 pt-2">
              <Button 
                type="submit" 
                className="flex-1 h-12 text-lg font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    入金する
                  </>
                )}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                className="h-12"
                disabled={isSaving}
              >
                キャンセル
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
