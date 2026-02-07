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
  const { selectedUser, user, theme } = useApp();
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

      // 今月の支出合計
      const { data: expenseData } = await supabase
        .from('transactions')
        .select('amount, category_main')
        .eq('user_type', selectedUser)
        .eq('type', 'expense')
        .gte('date', start)
        .lte('date', end);

      const totalExpense = expenseData?.reduce((sum, t) => sum + t.amount, 0) || 0;

      // カテゴリー別集計
      const categoryMap: Record<string, number> = {};
      expenseData?.forEach(t => {
        categoryMap[t.category_main] = (categoryMap[t.category_main] || 0) + t.amount;
      });

      // 貯金目標
      const { data: savingGoals } = await supabase
        .from('saving_goals')
        .select('*')
        .eq('user_type', selectedUser);

      // カテゴリーリスト
      const { data: categories } = await supabase
        .from('categories')
        .select('main_category, subcategories')
        .order('sort_order');

      return {
        totalExpense,
        categoryBreakdown: categoryMap,
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

  // Function Calling: 支出を記録
  const recordExpense = async (args: any) => {
    try {
      const { error } = await supabase
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
        });

      if (error) throw error;
      return { success: true, message: `${args.user_type}の支出を記録しました！` };
    } catch (error) {
      console.error('支出記録エラー:', error);
      return { success: false, message: '記録に失敗しました' };
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

      // システムプロンプト構築
      const systemPrompt = `あなたは「${selectedUser}」の家計簿AIアシスタントです。

【現在の状況】
- 今月の支出合計: ¥${context?.totalExpense.toLocaleString()}
- カテゴリー別支出: ${JSON.stringify(context?.categoryBreakdown)}
- 貯金目標: ${context?.savingGoals.map((g: any) => `${g.goal_name}(現在¥${g.current_amount.toLocaleString()}/目標¥${g.target_amount.toLocaleString()})`).join(', ')}

【利用可能なカテゴリー】
${context?.categories.map((c: any) => `- ${c.main_category}: ${c.subcategories.join(', ')}`).join('\n')}

【対応ルール】
1. 支出の記録リクエスト（「〇〇で△△円使った」「マクドナルド 500円」など）:
   - 必須: user_type（共同/${selectedUser}）、amount（金額）
   - 「自分」と言われたら user_type = "${selectedUser}" を使用
   - カテゴリーは文脈から推測（利用可能なカテゴリー一覧から選ぶ）
   - user_type が不明な場合のみ聞き返す。金額とカテゴリーが推測できるなら即座に記録する

2. 店名とメモの分離ルール（重要）:
   - 「ドミノピザ チーズピザ 4500円」→ store_name="ドミノピザ", memo="チーズピザ", amount=4500
   - 「マクドナルド 500円」→ store_name="マクドナルド", memo="", amount=500
   - 「コンビニでお茶 150円」→ store_name="コンビニ", memo="お茶", amount=150
   - 「タクシー 2000円」→ store_name="タクシー", memo="", amount=2000
   - 店名＝ブランド名・店舗名・サービス名。メモ＝購入した商品・詳細情報。
   - 店名だけの場合はmemoを空文字列にする。絶対に店名をmemoに入れない。

3. 記録後の確認:
   - 「✅ 【区分: 〇〇 / カテゴリー: △△ / 店名: □□ / 金額: ¥XX】を記録しました！」の形式

4. 金額の再確認ループの禁止:
   - ユーザーが金額を含むメッセージを送った場合、「金額は？」と再度聞かない
   - 1回のメッセージに店名・金額が含まれていれば即座にrecordExpenseを呼ぶ

5. 貯金の入金リクエスト:
   - どの目標か確認、完了後残りの必要額も伝える

6. 質問への回答: 現在の状況データを参照して回答

7. 返信スタイル: 簡潔で親しみやすい日本語、絵文字を適度に使用`;

      // Geminiモデル（Function Calling対応）
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        tools: [{
          functionDeclarations: [
            {
              name: 'recordExpense',
              description: '支出を記録する',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  user_type: { type: SchemaType.STRING, description: '区分（共同/れん/あかね）' },
                  category_main: { type: SchemaType.STRING, description: '大カテゴリー' },
                  category_sub: { type: SchemaType.STRING, description: '小カテゴリー' },
                  store_name: { type: SchemaType.STRING, description: '店名' },
                  amount: { type: SchemaType.NUMBER, description: '金額' },
                  date: { type: SchemaType.STRING, description: '日付（YYYY-MM-DD）' },
                  memo: { type: SchemaType.STRING, description: 'メモ' },
                },
                required: ['user_type', 'category_main', 'category_sub', 'amount'],
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
          // user_typeが「自分」の場合、selectedUserに置き換え
          const args = { ...functionCall.args } as any;
          if (args.user_type === '自分') {
            args.user_type = selectedUser;
          }
          functionResult = await recordExpense(args);
          console.log('Record Expense Result:', functionResult);
        } else if (functionCall.name === 'addSaving') {
          functionResult = await addSaving(functionCall.args as any);
          console.log('Add Saving Result:', functionResult);
        }

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
