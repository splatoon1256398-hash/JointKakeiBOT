"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Transaction {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name: string;
  amount: number;
  memo: string;
  type: string;
}

interface CategoryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  categoryIcon: string;
  subCategoryData: Array<{ name: string; value: number }>;
  transactions: Transaction[];
}

const CHART_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#f97316'];

export function CategoryDetailDialog({
  open,
  onOpenChange,
  categoryName,
  categoryIcon,
  subCategoryData,
  transactions,
}: CategoryDetailDialogProps) {
  const total = subCategoryData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border-slate-700">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-white">
              <span className="text-2xl">{categoryIcon}</span>
              {categoryName} の詳細
            </DialogTitle>
            <Button
              onClick={() => onOpenChange(false)}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-400">合計: ¥{total.toLocaleString()}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* 小カテゴリー円グラフ */}
          <div className="bg-slate-800/50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-3">内訳</h4>
            <div className="flex items-center gap-4">
              {/* 左側：凡例 */}
              <div className="flex-1 space-y-2">
                {subCategoryData.map((sub, index) => (
                  <div key={sub.name} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-sm" 
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{sub.name}</p>
                      <p className="text-xs text-red-400 font-semibold">¥{sub.value.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* 右側：円グラフ */}
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={subCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={50}
                      paddingAngle={3}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {subCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                      formatter={(value: number) => `¥${value.toLocaleString()}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 明細リスト */}
          <div className="bg-slate-800/50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-3">明細一覧</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-center text-gray-400 py-8">明細がありません</p>
              ) : (
                transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 hover:bg-slate-900/70 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{t.store_name || t.memo || t.category_sub}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {t.category_sub}
                        </Badge>
                        <span className="text-xs text-gray-400">{t.date}</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-red-400 ml-2">-¥{t.amount.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
