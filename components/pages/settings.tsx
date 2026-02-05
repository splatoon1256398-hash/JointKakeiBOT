"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Category {
  id: string;
  main_category: string;
  icon: string;
  subcategories: string[];
  sort_order: number;
}

export function Settings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ main_category: '', icon: '', subcategories: '' });

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');
      
      setCategories(data || []);
    } catch (error) {
      console.error('カテゴリー取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditForm({
      main_category: category.main_category,
      icon: category.icon,
      subcategories: category.subcategories.join(', '),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ main_category: '', icon: '', subcategories: '' });
  };

  const saveEdit = async (id: string) => {
    try {
      const subcategoriesArray = editForm.subcategories
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const { error } = await supabase
        .from('categories')
        .update({
          main_category: editForm.main_category,
          icon: editForm.icon,
          subcategories: subcategoriesArray,
        })
        .eq('id', id);

      if (error) throw error;

      await fetchCategories();
      cancelEdit();
      alert('カテゴリーを更新しました！');
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  const addCategory = async () => {
    try {
      const maxSortOrder = Math.max(...categories.map(c => c.sort_order), 0);
      
      const { error } = await supabase
        .from('categories')
        .insert({
          main_category: '新しいカテゴリー',
          icon: '📦',
          subcategories: ['その他'],
          sort_order: maxSortOrder + 1,
        });

      if (error) throw error;

      await fetchCategories();
      alert('カテゴリーを追加しました！');
    } catch (error) {
      console.error('追加エラー:', error);
      alert('追加に失敗しました');
    }
  };

  const deleteCategory = async (id: string, categoryName: string) => {
    if (!confirm(`「${categoryName}」を削除してもよろしいですか？`)) return;

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchCategories();
      alert('カテゴリーを削除しました');
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* ヘッダー */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-600 via-slate-600 to-zinc-600 p-6 shadow-2xl">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-3xl"></div>
        <div className="relative z-10 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-xl">
              <SettingsIcon className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">設定</h1>
              <p className="text-sm opacity-90">カテゴリー管理</p>
            </div>
          </div>
        </div>
      </div>

      {/* カテゴリー管理 */}
      <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>カテゴリー管理</CardTitle>
              <CardDescription>大カテゴリーと小カテゴリーを編集</CardDescription>
            </div>
            <Button onClick={addCategory} className="gap-2">
              <Plus className="h-4 w-4" />
              追加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="p-6 rounded-2xl bg-gradient-to-r from-white/80 to-gray-50/80 dark:from-slate-800/80 dark:to-slate-900/80 border border-gray-200/50 dark:border-gray-700/50"
                >
                  {editingId === category.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>大カテゴリー名</Label>
                          <Input
                            value={editForm.main_category}
                            onChange={(e) => setEditForm({ ...editForm, main_category: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>アイコン（絵文字）</Label>
                          <Input
                            value={editForm.icon}
                            onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                            maxLength={2}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>小カテゴリー（カンマ区切り）</Label>
                        <Input
                          value={editForm.subcategories}
                          onChange={(e) => setEditForm({ ...editForm, subcategories: e.target.value })}
                          placeholder="食料品, 外食, カフェ・間食"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => saveEdit(category.id)} className="gap-2">
                          <Save className="h-4 w-4" />
                          保存
                        </Button>
                        <Button onClick={cancelEdit} variant="outline" className="gap-2">
                          <X className="h-4 w-4" />
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{category.icon}</span>
                          <h3 className="text-xl font-bold">{category.main_category}</h3>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => startEdit(category)}
                            variant="outline"
                            size="sm"
                            className="gap-2"
                          >
                            <Pencil className="h-4 w-4" />
                            編集
                          </Button>
                          <Button
                            onClick={() => deleteCategory(category.id, category.main_category)}
                            variant="destructive"
                            size="sm"
                            className="gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {category.subcategories.map((sub, index) => (
                          <Badge key={index} variant="secondary">
                            {sub}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* その他の設定 */}
      <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-0 shadow-xl">
        <CardHeader>
          <CardTitle>その他の設定</CardTitle>
          <CardDescription>準備中</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          <SettingsIcon className="h-16 w-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" />
          <p>その他の設定は今後追加予定です</p>
        </CardContent>
      </Card>
    </div>
  );
}
