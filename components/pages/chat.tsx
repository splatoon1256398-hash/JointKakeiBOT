"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

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
  const lastRecordedIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    // 現在のhistory（新しいメッセージを除く、先頭の挨拶も除く）
    const historyForApi = messages.slice(1).map(m => ({
      role: m.role,
      content: m.content,
    }));

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Supabaseセッションからトークン取得
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("認証セッションが見つかりません");
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: input,
          selectedUser,
          displayName,
          history: historyForApi,
          lastRecordedId: lastRecordedIdRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // 最後に記録したIDを更新
      if (data.lastRecordedId) {
        lastRecordedIdRef.current = data.lastRecordedId;
      }

      // データ更新が必要な場合
      if (data.shouldRefresh) {
        triggerRefresh();
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
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
