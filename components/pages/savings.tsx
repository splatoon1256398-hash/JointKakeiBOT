"use client";

import { useState, useEffect, useCallback } from "react";
import { getJSTDateString } from "@/lib/date";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PiggyBank, Plus, Trash2, Target, Calendar, TrendingUp, Pencil, MinusCircle, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { EmptyState } from "@/components/empty-state";

interface SavingGoal {
  id: string;
  goal_name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  color: string;
  sort_order?: number;
}

interface SavingLog {
  id: string;
  goal_id: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  memo: string | null;
  date: string;
  created_at: string;
}

export function Savings() {
  const { selectedUser, theme, user } = useApp();
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | null>(null);
  const [withdrawGoal, setWithdrawGoal] = useState<SavingGoal | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMemo, setWithdrawMemo] = useState("");
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, SavingLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState({
    goal_name: "",
    target_amount: "",
    deadline: "",
    icon: "🎯",
  });
  const [editForm, setEditForm] = useState({
    goal_name: "",
    target_amount: "",
    deadline: "",
    icon: "🎯",
  });

  const fetchGoals = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('saving_goals')
        .select('*')
        .eq('user_type', selectedUser)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      
      setGoals(data || []);
    } catch (error) {
      console.error('目標取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // 貯金履歴の取得
  const fetchLogs = useCallback(async (goalId: string) => {
    setLogsLoading(goalId);
    try {
      const { data } = await supabase
        .from('saving_logs')
        .select('*')
        .eq('goal_id', goalId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      
      setLogs(prev => ({ ...prev, [goalId]: data || [] }));
    } catch (error) {
      console.error('履歴取得エラー:', error);
    } finally {
      setLogsLoading(null);
    }
  }, []);

  const { refreshTrigger } = useApp();
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchGoals();
      // 展開中の履歴も再読み込み
      if (expandedGoalId) {
        fetchLogs(expandedGoalId);
      }
    }
  }, [refreshTrigger, expandedGoalId, fetchGoals, fetchLogs]);

  // カードタップで履歴をアコーディオン展開/閉じ
  const toggleGoalExpand = async (goalId: string) => {
    if (expandedGoalId === goalId) {
      setExpandedGoalId(null);
      return;
    }
    setExpandedGoalId(goalId);
    if (!logs[goalId]) {
      await fetchLogs(goalId);
    }
  };

  const addGoal = async () => {
    if (!newGoal.goal_name || !newGoal.target_amount) {
      alert('目標名と目標金額を入力してください');
      return;
    }

    try {
      const maxSort = Math.max(...goals.map(g => g.sort_order || 0), 0);
      const { error } = await supabase
        .from('saving_goals')
        .insert({
          user_id: user?.id,
          user_type: selectedUser,
          goal_name: newGoal.goal_name,
          target_amount: parseInt(newGoal.target_amount),
          deadline: newGoal.deadline || null,
          icon: newGoal.icon,
          current_amount: 0,
          sort_order: maxSort + 1,
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

  // 目標の編集
  const startEdit = (goal: SavingGoal) => {
    setEditingGoal(goal);
    setEditForm({
      goal_name: goal.goal_name,
      target_amount: String(goal.target_amount),
      deadline: goal.deadline || "",
      icon: goal.icon,
    });
    setIsEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!editingGoal || !editForm.goal_name || !editForm.target_amount) return;

    try {
      const { error } = await supabase
        .from('saving_goals')
        .update({
          goal_name: editForm.goal_name,
          target_amount: parseInt(editForm.target_amount),
          deadline: editForm.deadline || null,
          icon: editForm.icon,
        })
        .eq('id', editingGoal.id);

      if (error) throw error;
      await fetchGoals();
      setIsEditDialogOpen(false);
      setEditingGoal(null);
    } catch (error) {
      console.error('編集エラー:', error);
      alert('編集に失敗しました');
    }
  };

  // 貯金の取り崩し
  const startWithdraw = (goal: SavingGoal) => {
    setWithdrawGoal(goal);
    setWithdrawAmount("");
    setWithdrawMemo("");
    setIsWithdrawDialogOpen(true);
  };

  const executeWithdraw = async () => {
    if (!withdrawGoal || !withdrawAmount || !user) return;

    const amount = parseInt(withdrawAmount);
    if (amount <= 0) {
      alert('正の金額を入力してください');
      return;
    }
    if (amount > withdrawGoal.current_amount) {
      alert('取り崩し額が現在の貯金額を超えています');
      return;
    }

    try {
      // current_amountを減算
      const newAmount = withdrawGoal.current_amount - amount;
      const { error: updateError } = await supabase
        .from('saving_goals')
        .update({ current_amount: newAmount })
        .eq('id', withdrawGoal.id);

      if (updateError) throw updateError;

      // saving_logsに取り崩し履歴を記録
      await supabase.from('saving_logs').insert({
        goal_id: withdrawGoal.id,
        user_id: user.id,
        user_type: selectedUser,
        type: 'withdraw',
        amount: amount,
        memo: withdrawMemo || null,
        date: getJSTDateString(),
      });

      await fetchGoals();
      // 展開中なら履歴も再取得
      if (expandedGoalId === withdrawGoal.id) {
        await fetchLogs(withdrawGoal.id);
      }
      setIsWithdrawDialogOpen(false);
      setWithdrawGoal(null);
    } catch (error) {
      console.error('取り崩しエラー:', error);
      alert('取り崩しに失敗しました');
    }
  };

  // 並べ替え
  const moveGoal = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= goals.length) return;

    const newGoals = [...goals];
    [newGoals[index], newGoals[swapIndex]] = [newGoals[swapIndex], newGoals[index]];

    try {
      for (let i = 0; i < newGoals.length; i++) {
        await supabase
          .from('saving_goals')
          .update({ sort_order: i })
          .eq('id', newGoals[i].id);
      }
      setGoals(newGoals.map((g, i) => ({ ...g, sort_order: i })));
    } catch (error) {
      console.error('並べ替えエラー:', error);
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
      {/* ヘッダー */}
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
          <EmptyState message="まだ目標がありません" />
          <p className="text-sm text-gray-500 mb-4">「＋新規」ボタンから目標を追加しましょう</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((goal, index) => {
            const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
            const monthlyRequired = calculateMonthlyRequired(goal);
            const daysRemaining = goal.deadline ? calculateDaysRemaining(goal.deadline) : null;

            return (
              <div key={goal.id} className="card-solid overflow-hidden">
                {/* タップ可能なメイン部分 */}
                <div 
                  className="p-6 cursor-pointer active:bg-white/5 transition-colors"
                  onClick={() => toggleGoalExpand(goal.id)}
                >
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
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => moveGoal(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 disabled:opacity-20"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveGoal(index, 'down')}
                        disabled={index === goals.length - 1}
                        className="p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 disabled:opacity-20"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => startEdit(goal)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => startWithdraw(goal)}
                        className="p-1.5 rounded-lg hover:bg-orange-500/20 text-white/40 hover:text-orange-400"
                        title="取り崩し"
                      >
                        <MinusCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteGoal(goal.id, goal.goal_name)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
                      毎月 ¥{monthlyRequired.toLocaleString()} 貯めれば達成できます
                    </p>
                  )}

                  {/* 展開インジケーター */}
                  <div className="flex justify-center mt-3">
                    <div className={`transition-transform duration-200 ${expandedGoalId === goal.id ? 'rotate-180' : ''}`}>
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </div>
                  </div>
                </div>

                {/* アコーディオン: 貯金履歴 */}
                {expandedGoalId === goal.id && (
                  <div className="border-t border-white/10 bg-white/[0.02]">
                    <div className="px-6 py-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" style={{ color: theme.primary }} />
                        入出金履歴
                      </h4>
                      {logsLoading === goal.id ? (
                        <div className="py-6 text-center text-gray-500 text-sm">読み込み中...</div>
                      ) : !logs[goal.id] || logs[goal.id].length === 0 ? (
                        <div className="py-6 text-center text-gray-500 text-sm">まだ履歴がありません</div>
                      ) : (
                        <div className="space-y-2">
                          {logs[goal.id].map((log) => (
                            <div
                              key={log.id}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl card-solid-inner border-l-2 ${
                                log.type === 'deposit' ? 'border-emerald-500' : 'border-orange-500'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  log.type === 'deposit'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-orange-500/20 text-orange-400'
                                }`}>
                                  {log.type === 'deposit' ? '入金' : '出金'}
                                </span>
                                <span className="text-xs text-gray-500 shrink-0">{log.date}</span>
                                {log.memo && (
                                  <span className="text-xs text-white/60 truncate">{log.memo}</span>
                                )}
                              </div>
                              <span className={`text-sm font-bold shrink-0 ml-2 ${
                                log.type === 'deposit' ? 'text-emerald-400' : 'text-orange-400'
                              }`}>
                                {log.type === 'deposit' ? '+' : '-'}¥{log.amount.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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

      {/* 目標編集ダイアログ */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent 
          className="bg-slate-900/95 backdrop-blur-xl border-slate-700"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Pencil className="h-4 w-4" style={{ color: theme.primary }} />
              目標を編集
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">目標名</Label>
              <Input
                value={editForm.goal_name}
                onChange={(e) => setEditForm({ ...editForm, goal_name: e.target.value })}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">目標金額</Label>
              <Input
                type="number"
                value={editForm.target_amount}
                onChange={(e) => setEditForm({ ...editForm, target_amount: e.target.value })}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">期限</Label>
              <Input
                type="date"
                value={editForm.deadline}
                onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">アイコン</Label>
              <Input
                value={editForm.icon}
                onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                maxLength={2}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveEdit} className="flex-1" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
                保存
              </Button>
              <Button onClick={() => setIsEditDialogOpen(false)} variant="outline" className="flex-1">
                キャンセル
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 取り崩しダイアログ */}
      <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
        <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <MinusCircle className="h-4 w-4 text-orange-400" />
              貯金を取り崩す
            </DialogTitle>
          </DialogHeader>
          {withdrawGoal && (
            <div className="space-y-4">
              <div className="rounded-xl p-3 bg-orange-500/10 border border-orange-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{withdrawGoal.icon}</span>
                  <span className="font-bold text-white">{withdrawGoal.goal_name}</span>
                </div>
                <p className="text-sm text-orange-300/70">
                  現在の貯金額: ¥{withdrawGoal.current_amount.toLocaleString()}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-white">取り崩し金額 *</Label>
                <Input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="10000"
                  max={withdrawGoal.current_amount}
                  className="bg-slate-800/50 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white">メモ（使用目的）</Label>
                <Input
                  value={withdrawMemo}
                  onChange={(e) => setWithdrawMemo(e.target.value)}
                  placeholder="例：旅行の航空券購入"
                  className="bg-slate-800/50 border-slate-700 text-white"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={executeWithdraw} className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600">
                  取り崩す
                </Button>
                <Button onClick={() => setIsWithdrawDialogOpen(false)} variant="outline" className="flex-1">
                  キャンセル
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
