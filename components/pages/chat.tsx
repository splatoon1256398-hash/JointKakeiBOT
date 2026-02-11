"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Gemini APIを初期化
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export function Chat() {
  const { selectedUser, user, theme, displayName, triggerRefresh } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: `こんにちは！${selectedUser}の家計簿AIアシスタントです。\n\n「スタバで700円使った」のように話しかけると支出を記録できます。「今月の残り予算は？」と聞くと分析結果をお答えします。\n\n※このチャット履歴は画面を離れるとリセットされます。`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 現在の予算状況を取得
  const fetchCurrentContext = async () => {
    try {
      const { start, end } = getMonthRange();

      // 前月の範囲も計算
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const prevStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
      const prevEnd = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(prevMonthEnd.getDate()).padStart(2, '0')}`;

      // 今月の支出
      const { data: expenseData } = await supabase
        .from('transactions')
        .select('amount, category_main')
        .eq('user_type', selectedUser)
        .eq('type', 'expense')
        .gte('date', start)
        .lte('date', end);

      const totalExpense = expenseData?.reduce((sum, t) => sum + t.amount, 0) || 0;

      const categoryMap: Record<string, number> = {};
      expenseData?.forEach(t => {
        categoryMap[t.category_main] = (categoryMap[t.category_main] || 0) + t.amount;
      });

      // 前月の支出
      const { data: prevExpenseData } = await supabase
        .from('transactions')
        .select('amount, category_main')
        .eq('user_type', selectedUser)
        .eq('type', 'expense')
        .gte('date', prevStart)
        .lte('date', prevEnd);

      const prevTotalExpense = prevExpenseData?.reduce((sum, t) => sum + t.amount, 0) || 0;
      const prevCategoryMap: Record<string, number> = {};
      prevExpenseData?.forEach(t => {
        prevCategoryMap[t.category_main] = (prevCategoryMap[t.category_main] || 0) + t.amount;
      });

      // 今月の収入
      const { data: incomeData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_type', selectedUser)
        .eq('type', 'income')
        .gte('date', start)
        .lte('date', end);

      const totalIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;

      // 予算
      const { data: budgets } = await supabase
        .from('budgets')
        .select('category_main, monthly_budget')
        .eq('user_type', selectedUser);

      const budgetMap: Record<string, number> = {};
      budgets?.forEach(b => { budgetMap[b.category_main] = b.monthly_budget; });

      // 貯金目標
      const { data: savingGoals } = await supabase
        .from('saving_goals')
        .select('*')
        .eq('user_type', selectedUser);

      // カテゴリーリスト（常にDB最新を取得）
      const { data: categories } = await supabase
        .from('categories')
        .select('main_category, subcategories')
        .order('sort_order');

      return {
        totalExpense,
        totalIncome,
        prevTotalExpense,
        categoryBreakdown: categoryMap,
        prevCategoryBreakdown: prevCategoryMap,
        budgets: budgetMap,
        savingGoals: savingGoals || [],
        categories: categories || [],
      };
    } catch (error) {
      console.error('コンテキスト取得エラー:', error);
      return null;
    }
  };

  const getMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: firstDay.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0],
    };
  };

  // 直前に記録したトランザクションIDを保持（修正用）
  const lastRecordedIdRef = useRef<string | null>(null);

  // Function Calling: 支出を記録
  const recordExpense = async (args: any) => {
    try {
      const { data: inserted, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user?.id,
          user_type: args.user_type || selectedUser,
          type: 'expense',
          date: args.date || new Date().toISOString().split('T')[0],
          category_main: args.category_main,
          category_sub: args.category_sub,
          store_name: args.store_name || '',
          amount: args.amount,
          memo: args.memo || '',
        })
        .select('id')
        .single();

      if (error) throw error;
      
      // 直前のIDを保存（修正対応用）
      if (inserted?.id) {
        lastRecordedIdRef.current = inserted.id;
      }

      // 共同支出の場合、パートナーにPush通知を送信
      const userType = args.user_type || selectedUser;
      if (userType === "共同" && user?.id) {
        try {
          await fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: '共同支出が登録されました',
              body: `${displayName}が共同支出を登録: ${args.store_name || args.category_main} ¥${Number(args.amount).toLocaleString()}`,
              excludeUserId: user.id, // 自分には送らない
            }),
          });
        } catch (pushErr) {
          console.error('Push通知送信エラー:', pushErr);
        }
      }

      return { success: true, message: `${userType}の支出を記録しました！`, transactionId: inserted?.id };
    } catch (error) {
      console.error('支出記録エラー:', error);
      return { success: false, message: '記録に失敗しました' };
    }
  };

  // Function Calling: 直前のトランザクションを修正
  const updateLastTransaction = async (args: any) => {
    const targetId = args.transaction_id || lastRecordedIdRef.current;
    if (!targetId) {
      return { success: false, message: '修正対象のトランザクションが見つかりません。' };
    }
    try {
      const updates: Record<string, unknown> = {};
      if (args.amount !== undefined) updates.amount = args.amount;
      if (args.category_main) updates.category_main = args.category_main;
      if (args.category_sub) updates.category_sub = args.category_sub;
      if (args.store_name !== undefined) updates.store_name = args.store_name;
      if (args.memo !== undefined) updates.memo = args.memo;
      if (args.date) updates.date = args.date;

      if (Object.keys(updates).length === 0) {
        return { success: false, message: '修正項目が指定されていません。' };
      }

      const { error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', targetId);

      if (error) throw error;
      return { success: true, message: `トランザクション(${targetId})を修正しました！` };
    } catch (error) {
      console.error('トランザクション修正エラー:', error);
      return { success: false, message: '修正に失敗しました' };
    }
  };

  // Function Calling: 予算を更新
  const updateBudget = async (args: any) => {
    try {
      const { data: existing } = await supabase
        .from('budgets')
        .select('id')
        .eq('user_type', args.user_type || selectedUser)
        .eq('category_main', args.category_main)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('budgets')
          .update({ monthly_budget: args.monthly_budget })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('budgets')
          .insert({
            user_type: args.user_type || selectedUser,
            category_main: args.category_main,
            monthly_budget: args.monthly_budget,
          });
        if (error) throw error;
      }
      return { success: true, message: `${args.category_main}の予算を¥${Number(args.monthly_budget).toLocaleString()}に設定しました。` };
    } catch (error) {
      console.error('予算更新エラー:', error);
      return { success: false, message: '予算の更新に失敗しました' };
    }
  };

  // Function Calling: カテゴリ追加
  const addCategory = async (args: any) => {
    try {
      const { data: existing } = await supabase
        .from('categories')
        .select('id, subcategories')
        .eq('main_category', args.main_category)
        .single();

      if (existing) {
        // 既存の大カテゴリにサブカテゴリを追加
        if (args.subcategory) {
          const subs = Array.isArray(existing.subcategories) ? existing.subcategories : [];
          if (!subs.includes(args.subcategory)) {
            subs.push(args.subcategory);
            await supabase.from('categories').update({ subcategories: subs }).eq('id', existing.id);
          }
        }
        return { success: true, message: `カテゴリ「${args.main_category}」を更新しました。` };
      } else {
        await supabase.from('categories').insert({
          main_category: args.main_category,
          icon: args.icon || '📦',
          subcategories: args.subcategory ? [args.subcategory] : ['その他'],
          sort_order: 99,
        });
        return { success: true, message: `カテゴリ「${args.main_category}」を追加しました。` };
      }
    } catch (error) {
      console.error('カテゴリ追加エラー:', error);
      return { success: false, message: 'カテゴリの追加に失敗しました' };
    }
  };

  // Function Calling: 貯金に入金
  const addSaving = async (args: any) => {
    try {
      const { data: goals } = await supabase
        .from('saving_goals')
        .select('*')
        .eq('user_type', selectedUser)
        .eq('goal_name', args.goal_name)
        .single();

      if (!goals) {
        return { success: false, message: `目標「${args.goal_name}」が見つかりませんでした` };
      }

      const newAmount = goals.current_amount + args.amount;
      const { error } = await supabase
        .from('saving_goals')
        .update({ current_amount: newAmount })
        .eq('id', goals.id);

      if (error) throw error;

      const remaining = goals.target_amount - newAmount;
      return {
        success: true,
        message: `${args.goal_name}に¥${args.amount.toLocaleString()}を入金しました！残り¥${remaining.toLocaleString()}です。`,
      };
    } catch (error) {
      console.error('貯金入金エラー:', error);
      return { success: false, message: '入金に失敗しました' };
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // 現在のコンテキストを取得
      const context = await fetchCurrentContext();

      // 会話履歴を構築（過去のメッセージを保持して文脈を維持）
      const conversationHistory = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));

      // 予算情報の構築
      const budgetInfo = context?.budgets
        ? Object.entries(context.budgets).map(([cat, budget]) => {
            const spent = context.categoryBreakdown[cat] || 0;
            return `${cat}: 予算¥${Number(budget).toLocaleString()} / 支出¥${spent.toLocaleString()} / 残¥${(Number(budget) - spent).toLocaleString()}`;
          }).join('\n')
        : 'なし';

      // 前月比較
      const prevComparison = context?.prevCategoryBreakdown
        ? Object.entries(context.categoryBreakdown).map(([cat, amount]) => {
            const prev = context.prevCategoryBreakdown[cat] || 0;
            const diff = prev > 0 ? Math.round(((amount as number) - prev) / prev * 100) : 0;
            return `${cat}: 今月¥${Number(amount).toLocaleString()} (前月比${diff >= 0 ? '+' : ''}${diff}%)`;
          }).join('\n')
        : '';

      // 執事モード システムプロンプト
      const systemPrompt = `あなたは「${selectedUser}」の家計簿パーソナル執事AIである。
無意味な挨拶や冗長な説明は省き、ユーザーの資産管理を支える「正確なツール」として振る舞え。
現在のユーザー名: ${displayName}

【現在の状況】
- 今月の支出合計: ¥${context?.totalExpense?.toLocaleString() || 0}
- 今月の収入合計: ¥${context?.totalIncome?.toLocaleString() || 0}
- 前月の支出合計: ¥${context?.prevTotalExpense?.toLocaleString() || 0}
- カテゴリー別予算と支出:
${budgetInfo}
- カテゴリー別前月比:
${prevComparison}
- 貯金目標: ${context?.savingGoals?.map((g: any) => `${g.goal_name}(¥${g.current_amount?.toLocaleString()}/¥${g.target_amount?.toLocaleString()} = ${g.target_amount > 0 ? Math.round(g.current_amount / g.target_amount * 100) : 0}%)`).join(', ') || 'なし'}

【利用可能なカテゴリー】
${context?.categories?.map((c: any) => `- ${c.main_category}: ${c.subcategories?.join(', ')}`).join('\n') || '- その他: その他'}

【コア機能1: 爆速入力】
- 支出記録: 店名+金額があれば即座にrecordExpenseを呼ぶ。聞き返すな。
  - 「ドミノピザ チーズピザ 4500円」→ store_name="ドミノピザ", memo="チーズピザ", amount=4500
  - 「マクドナルド 500円」→ store_name="マクドナルド", memo="", amount=500
  - 「コンビニでお茶 150円」→ store_name="コンビニ", memo="お茶", amount=150
  - 店名＝ブランド名・店舗名。メモ＝購入した商品・詳細。店名だけの場合はmemo=""
  - 「自分」「個人」→ user_type="${displayName}"、「共同」→ user_type="共同"
  - user_typeが不明な場合のみ聞き返す
- 複数項目: 「シャンプーと豚肉で3000円」→ 1件で memo に詳細リスト、または分類が異なれば個別記録
- 記録後: 表形式で結果を表示: 「✅ 【区分: 〇〇 / カテゴリー: △△ / 店名: □□ / 金額: ¥XX】」
- 情報不足時: 不足分だけをピンポイントで聞く（「金額が抜けてますね。いくらでしたか？」）
- 金額の再確認ループ禁止: 一度提示された情報は保持。「金額は？」と再度聞かない

【コア機能1.5: 修正対応】
- 記録直後の「やっぱり〇〇円だった」「カテゴリを△△にして」→ updateLastTransactionを呼ぶ
- 修正完了時: 「¥〇〇に修正しました！」と結果を表示

【コア機能2: FP分析】
- 支出傾向について聞かれたら、上記データを使って具体的な数字ベースの分析を返す
- 「外食が先月より20%多いので、今週は自炊がおすすめですよ」等の具体的アドバイス
- 予算超過しているカテゴリがあれば積極的に警告

【コア機能3: 貯金コーチ】
- 貯金の話題が出たらsaving_goalsの進捗率を計算し、ポジティブなフィードバックを返す
- 「ハワイまであと3万円！今のペースなら夏には行けますよ」等

【コア機能4: 設定変更】
- 「予算を5万円にして」→ updateBudget を呼ぶ
- 「カテゴリに推し活を追加して」→ addCategory を呼ぶ
- 更新後は確認メッセージを返す

【返信スタイル】
- 簡潔で的確な日本語。冗長な説明は不要
- 絵文字は最小限（✅❌📊💰等の機能的なもののみ）
- 登録・修正完了時は必ずサマリーを表示`;

      // Geminiモデル（執事モード Function Calling）
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        tools: [{
          functionDeclarations: [
            {
              name: 'recordExpense',
              description: '支出を記録する。店名+金額が分かれば即座に呼ぶ',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  user_type: { type: SchemaType.STRING, description: '区分（共同/れん/あかね）' },
                  category_main: { type: SchemaType.STRING, description: '大カテゴリー' },
                  category_sub: { type: SchemaType.STRING, description: '小カテゴリー' },
                  store_name: { type: SchemaType.STRING, description: '店名（ブランド名・店舗名）' },
                  amount: { type: SchemaType.NUMBER, description: '金額' },
                  date: { type: SchemaType.STRING, description: '日付（YYYY-MM-DD）' },
                  memo: { type: SchemaType.STRING, description: 'メモ（商品詳細。店名だけの場合は空文字）' },
                },
                required: ['user_type', 'category_main', 'category_sub', 'amount'],
              },
            },
            {
              name: 'updateLastTransaction',
              description: '直前に記録したトランザクションを修正する。「やっぱり○○円だった」「カテゴリを変えて」等に使う',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  transaction_id: { type: SchemaType.STRING, description: 'トランザクションID（省略時は直前の記録）' },
                  amount: { type: SchemaType.NUMBER, description: '修正後の金額' },
                  category_main: { type: SchemaType.STRING, description: '修正後の大カテゴリー' },
                  category_sub: { type: SchemaType.STRING, description: '修正後の小カテゴリー' },
                  store_name: { type: SchemaType.STRING, description: '修正後の店名' },
                  memo: { type: SchemaType.STRING, description: '修正後のメモ' },
                  date: { type: SchemaType.STRING, description: '修正後の日付' },
                },
                required: [],
              },
            },
            {
              name: 'addSaving',
              description: '貯金目標に入金する',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  goal_name: { type: SchemaType.STRING, description: '目標名' },
                  amount: { type: SchemaType.NUMBER, description: '入金額' },
                },
                required: ['goal_name', 'amount'],
              },
            },
            {
              name: 'updateBudget',
              description: '予算を設定・変更する。「予算を5万円にして」等',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  user_type: { type: SchemaType.STRING, description: '区分（共同/れん/あかね）' },
                  category_main: { type: SchemaType.STRING, description: '対象カテゴリー' },
                  monthly_budget: { type: SchemaType.NUMBER, description: '月間予算額' },
                },
                required: ['category_main', 'monthly_budget'],
              },
            },
            {
              name: 'addCategory',
              description: 'カテゴリを追加・更新する。「カテゴリに推し活を追加して」等',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  main_category: { type: SchemaType.STRING, description: '大カテゴリー名' },
                  subcategory: { type: SchemaType.STRING, description: 'サブカテゴリー名' },
                  icon: { type: SchemaType.STRING, description: '絵文字アイコン' },
                },
                required: ['main_category'],
              },
            },
          ],
        }],
      });

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'はい、承知しました。家計簿アシスタントとして対応します。' }] },
          // 過去の会話履歴を含めて文脈を維持（最新のユーザーメッセージは除く）
          ...conversationHistory.slice(1, -1).map(m => ({
            role: m.role as "user" | "model",
            parts: m.parts,
          })),
        ],
      });

      const result = await chat.sendMessage(userMessage.content);
      const response = result.response;

      // Function Callingの処理
      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        const functionCall = functionCalls[0];
        let functionResult: { success: boolean; message: string } = { success: false, message: '不明なエラー' };
        
        console.log('Function Call:', functionCall.name, functionCall.args);
        
        if (functionCall.name === 'recordExpense') {
          const args = { ...functionCall.args } as any;
          if (args.user_type === '自分' || args.user_type === '個人') {
            args.user_type = displayName || selectedUser;
          }
          functionResult = await recordExpense(args);
          triggerRefresh();
        } else if (functionCall.name === 'updateLastTransaction') {
          functionResult = await updateLastTransaction(functionCall.args as any);
          triggerRefresh();
        } else if (functionCall.name === 'addSaving') {
          functionResult = await addSaving(functionCall.args as any);
          triggerRefresh();
        } else if (functionCall.name === 'updateBudget') {
          const args = { ...functionCall.args } as any;
          if (!args.user_type) args.user_type = selectedUser;
          functionResult = await updateBudget(args);
          triggerRefresh();
        } else if (functionCall.name === 'addCategory') {
          functionResult = await addCategory(functionCall.args as any);
          triggerRefresh();
        }
        console.log('Function Result:', functionCall.name, functionResult);

        // 関数実行結果をAIに返して、最終的な返答を生成
        const finalResult = await chat.sendMessage([{
          functionResponse: {
            name: functionCall.name,
            response: functionResult as object,
          },
        }]);

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: finalResult.response.text(),
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // 通常の応答
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.text(),
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("AI応答エラー:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "申し訳ございません。エラーが発生しました。もう一度お試しください。",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col pt-3 overflow-hidden" style={{ height: 'calc(100dvh - 120px)' }}>
      {/* ヘッダー */}
      <div 
        className="relative overflow-hidden rounded-xl p-3 shadow-xl backdrop-blur-xl mb-3 flex-shrink-0"
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: `2px solid ${theme.primary}`
        }}
      >
        <div className="text-white flex items-center gap-2">
          <MessageCircle className="h-4 w-4" style={{ color: theme.primary }} />
          <h1 className="text-base font-bold">AIチャット - {selectedUser}</h1>
        </div>
      </div>

      {/* メッセージエリア + 入力エリアをflexで収める */}
      <Card className="flex-1 bg-slate-800/50 backdrop-blur-xl border-slate-700/50 shadow-xl overflow-hidden flex flex-col min-h-0">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-none">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-4 ${
                  message.role === "user"
                    ? "text-white"
                    : "bg-slate-800/90 border border-white/10 text-gray-100"
                }`}
                style={message.role === "user" ? { background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` } : {}}
              >
                {message.role === "assistant" && (
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <span className="text-xs text-purple-400 font-semibold">AI</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs opacity-60 mt-2">
                  {message.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-800/90 border border-white/10 rounded-2xl p-4">
                <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* 入力エリア: sticky bottom, safe-area対応 */}
        <div className="flex-shrink-0 p-3 border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-md" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="メッセージを入力..."
              className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder:text-gray-400"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
