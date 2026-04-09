"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Save, X, Tag, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface Category {
  id: string;
  main_category: string;
  icon: string;
  subcategories: string[];
  sort_order: number;
}

export function Settings() {
  const { theme, refreshCategories } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ main_category: '', icon: '', subcategories: '' });

  // Settings ページは CRUD の主体なので、DB から直接 full row を取得する。
  // CRUD 後に refreshCategories() を呼んで AppContext 側の他ページにも反映する。
  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');

      setCategories(data || []);
      // 他のページが参照する AppContext 側も最新化
      refreshCategories();
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
    } catch (error) {
      console.error('追加エラー:', error);
      alert('追加に失敗しました');
    }
  };

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= categories.length) return;

    const newCategories = [...categories];
    [newCategories[index], newCategories[swapIndex]] = [newCategories[swapIndex], newCategories[index]];

    // sort_orderを更新
    try {
      for (let i = 0; i < newCategories.length; i++) {
        await supabase
          .from('categories')
          .update({ sort_order: i })
          .eq('id', newCategories[i].id);
      }
      setCategories(newCategories.map((c, i) => ({ ...c, sort_order: i })));
    } catch (error) {
      console.error('並べ替えエラー:', error);
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
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Tag className="h-5 w-5" style={{ color: theme.primary }} />
            カテゴリー管理
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            大カテゴリーと小カテゴリーを編集
          </p>
        </div>
        <button
          onClick={addCategory}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
          style={{ backgroundColor: theme.primary }}
        >
          <Plus className="h-3.5 w-3.5" />
          追加
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category.id}
              className="rounded-xl bg-black/15 border border-white/5 overflow-hidden"
            >
              {editingId === category.id ? (
                <div className="p-3 space-y-3">
                  <div className="grid grid-cols-[1fr_60px] gap-2">
                    <Input
                      value={editForm.main_category}
                      onChange={(e) => setEditForm({ ...editForm, main_category: e.target.value })}
                      placeholder="カテゴリー名"
                      className="h-8 text-sm bg-black/20 border-white/10 text-white"
                    />
                    <Input
                      value={editForm.icon}
                      onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                      maxLength={2}
                      className="h-8 text-sm text-center bg-black/20 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 mb-1">小カテゴリー（カンマ区切り）</p>
                    <Input
                      value={editForm.subcategories}
                      onChange={(e) => setEditForm({ ...editForm, subcategories: e.target.value })}
                      placeholder="食料品, 外食, カフェ"
                      className="h-8 text-sm bg-black/20 border-white/10 text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(category.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-xs font-semibold text-white"
                      style={{ backgroundColor: theme.primary }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      保存
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center justify-center gap-1.5 p-2 rounded-lg text-xs font-semibold text-white/60 bg-white/10 hover:bg-white/15"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{category.icon}</span>
                      <span className="text-sm font-bold text-white">{category.main_category}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => moveCategory(categories.indexOf(category), 'up')}
                        disabled={categories.indexOf(category) === 0}
                        className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/30 hover:text-white/60 disabled:opacity-20"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveCategory(categories.indexOf(category), 'down')}
                        disabled={categories.indexOf(category) === categories.length - 1}
                        className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/30 hover:text-white/60 disabled:opacity-20"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => startEdit(category)}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/70"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCategory(category.id, category.main_category)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors text-white/40 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {category.subcategories.map((sub, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-white/60 border border-white/5"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
