"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PiggyBank, Plus, Trash2, Target, Calendar, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface SavingGoal {
  id: string;
  goal_name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  color: string;
}

export function Savings() {
  const { selectedUser, theme } = useApp();
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({
    goal_name: "",
    target_amount: "",
    deadline: "",
    icon: "🎯",
  });

  const fetchGoals = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('saving_goals')
        .select('*')
        .eq('user_type', selectedUser)
        .order('created_at', { ascending: false });
      
      setGoals(data || []);
    } catch (error) {
      console.error('目標取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, [selectedUser]);

  // refreshTriggerの変更を監視して自動更新
  const { refreshTrigger } = useApp();
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchGoals();
    }
  }, [refreshTrigger]);

  const addGoal = async () => {
    if (!newGoal.goal_name || !newGoal.target_amount) {
      alert('目標名と目標金額を入力してください');
      return;
    }

    try {
      const { error } = await supabase
        .from('saving_goals')
        .insert({
          user_type: selectedUser,
          goal_name: newGoal.goal_name,
          target_amount: parseInt(newGoal.target_amount),
          deadline: newGoal.deadline || null,
          icon: newGoal.icon,
          current_amount: 0,
        });

      if (error) throw error;

      await fetchGoals();
      setIsAddDialogOpen(false);
      setNewGoal({ goal_name: "", target_amount: "", deadline: "", icon: "🎯" });
    } catch (error) {
      console.error('追加エラー:', error);
      alert('目標の追加に失敗しました');
    }
  };

  const deleteGoal = async (id: string, goalName: string) => {
    if (!confirm(`「${goalName}」を削除してもよろしいですか？`)) return;

    try {
      const { error } = await supabase
        .from('saving_goals')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchGoals();
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  const calculateMonthlyRequired = (goal: SavingGoal) => {
    if (!goal.deadline) return null;
    
    const today = new Date();
    const deadline = new Date(goal.deadline);
    const monthsRemaining = Math.max(1, Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const remaining = goal.target_amount - goal.current_amount;
    
    return Math.ceil(remaining / monthsRemaining);
  };

  const calculateDaysRemaining = (deadline: string) => {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    return Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-3 pb-24 pt-3">
      {/* ヘッダー（テーマカラーのボーダー） */}
      <div 
        className="relative overflow-hidden rounded-xl p-3 shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: `2px solid ${theme.primary}`
        }}
      >
        <div className="text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" style={{ color: theme.primary }} />
              <h1 className="text-base font-bold">目的別貯金 - {selectedUser}</h1>
            </div>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-xl border-white/30 h-7 text-xs px-2"
              size="sm"
            >
              <Plus className="h-3 w-3 mr-1" />
              新規
            </Button>
          </div>
        </div>
      </div>

      {/* 目標リスト */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 card-solid rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="card-solid p-12 text-center">
          <PiggyBank className="h-20 w-20 mx-auto text-gray-600 mb-4" />
          <p className="text-lg font-semibold text-gray-400 mb-2">まだ目標がありません</p>
          <p className="text-sm text-gray-500 mb-4">「＋新規」ボタンから目標を追加しましょう</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((goal) => {
            const progress = (goal.current_amount / goal.target_amount) * 100;
            const monthlyRequired = calculateMonthlyRequired(goal);
            const daysRemaining = goal.deadline ? calculateDaysRemaining(goal.deadline) : null;

            return (
              <div key={goal.id} className="card-solid overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{goal.icon}</span>
                      <div>
                        <h3 className="text-xl font-bold text-white">{goal.goal_name}</h3>
                        <p className="text-sm text-gray-400">
                          ¥{goal.current_amount.toLocaleString()} / ¥{goal.target_amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => deleteGoal(goal.id, goal.goal_name)}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* プログレスバー */}
                  <div className="mb-4">
                    <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-sm">
                      <span className="text-gray-400">達成率</span>
                      <span className="font-semibold text-green-400">{progress.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* 詳細情報 */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 rounded-xl card-solid-inner min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="h-4 w-4 text-blue-400" />
                        <span className="text-xs text-gray-400">残り</span>
                      </div>
                      <p className="font-bold text-white whitespace-nowrap" style={{ fontSize: 'clamp(0.75rem, 3vw, 1rem)' }}>
                        ¥{(goal.target_amount - goal.current_amount).toLocaleString()}
                      </p>
                    </div>

                    {monthlyRequired && (
                      <div className="p-3 rounded-xl card-solid-inner">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="h-4 w-4 text-purple-400" />
                          <span className="text-xs text-gray-400">月額</span>
                        </div>
                        <p className="font-bold text-white whitespace-nowrap" style={{ fontSize: 'clamp(0.75rem, 3vw, 1.125rem)' }}>
                          ¥{monthlyRequired.toLocaleString()}
                        </p>
                      </div>
                    )}

                    {daysRemaining && (
                      <div className="p-3 rounded-xl card-solid-inner">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4 text-orange-400" />
                          <span className="text-xs text-gray-400">期限</span>
                        </div>
                        <p className="font-bold text-white whitespace-nowrap" style={{ fontSize: 'clamp(0.75rem, 3vw, 1.125rem)' }}>
                          {daysRemaining}日
                        </p>
                      </div>
                    )}
                  </div>

                  {monthlyRequired && (
                    <p className="mt-4 text-sm text-gray-400 text-center">
                      💡 毎月 ¥{monthlyRequired.toLocaleString()} 貯めれば達成できます
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新規目標追加ダイアログ */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">新しい目標を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">目標名 *</Label>
              <Input
                value={newGoal.goal_name}
                onChange={(e) => setNewGoal({ ...newGoal, goal_name: e.target.value })}
                placeholder="例：旅行資金、車購入"
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">目標金額 *</Label>
              <Input
                type="number"
                value={newGoal.target_amount}
                onChange={(e) => setNewGoal({ ...newGoal, target_amount: e.target.value })}
                placeholder="100000"
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">期限</Label>
              <Input
                type="date"
                value={newGoal.deadline}
                onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">アイコン</Label>
              <Input
                value={newGoal.icon}
                onChange={(e) => setNewGoal({ ...newGoal, icon: e.target.value })}
                placeholder="🎯"
                maxLength={2}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={addGoal} className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600">
                追加
              </Button>
              <Button onClick={() => setIsAddDialogOpen(false)} variant="outline" className="flex-1">
                キャンセル
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
