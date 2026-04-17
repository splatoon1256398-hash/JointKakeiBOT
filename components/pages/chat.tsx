"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Sparkles, Loader2, Mic, MicOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  functionCalls?: Array<{ name: string; args: Record<string, unknown>; result: { success: boolean; message: string } }>;
}

// 録音の最長秒数 (保険)。手動停止 or この時間経過で自動停止する
const MAX_RECORDING_MS = 60_000;

/**
 * MediaRecorder が吐ける mimeType をブラウザごとに探す。
 * - iOS Safari (PWA含む): audio/mp4 のみ
 * - Android/Chrome: audio/webm;codecs=opus が最良
 */
function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  // isTypeSupported が false を返しても実際は録音できる iOS 系の挙動に備えて undefined を返す
  return undefined;
}

export function Chat() {
  const { selectedUser, theme, triggerRefresh } = useApp();
  const { assets: charAssets, isActive: charActive, characterName } = useCharacter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastRecordedIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // MediaRecorder / getUserMedia が無いブラウザではマイクボタンを非表示
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const hasUserMedia = !!navigator.mediaDevices?.getUserMedia;
    const hasRecorder = typeof MediaRecorder !== "undefined";
    if (!hasUserMedia || !hasRecorder) {
      setSpeechSupported(false);
    }
  }, []);

  // アンマウント時: 録音中なら強制停止してストリーム解放
  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      try { mediaRecorderRef.current?.stop(); } catch {}
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  };

  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("認証セッションが見つかりません");

      const form = new FormData();
      form.append("audio", blob, `speech.${blob.type.includes("mp4") ? "m4a" : "webm"}`);

      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `STT API error: ${res.status}`);

      const text = (data.text || "").trim();
      if (text) {
        setInput((prev) => (prev ? prev + " " + text : text));
      }
    } catch (err) {
      console.error("音声書き起こしエラー:", err);
      const msg = err instanceof Error ? err.message : "音声の書き起こしに失敗しました";
      alert(`音声認識に失敗しました: ${msg}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const startVoiceInput = async () => {
    // 録音中にもう一度押されたら停止
    if (isRecording) {
      try { mediaRecorderRef.current?.stop(); } catch {}
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSpeechSupported(false);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as Error & { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        alert("マイクへのアクセスが許可されていません。ブラウザ/OSの設定からマイクを許可してください。");
      } else if (name === "NotFoundError") {
        alert("マイクが見つかりませんでした。");
      } else {
        alert("マイクを起動できませんでした。");
      }
      return;
    }

    mediaStreamRef.current = stream;
    const mime = pickRecorderMime();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stopMediaStream();
      setSpeechSupported(false);
      return;
    }
    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      setIsRecording(false);
      const type = recorder.mimeType || mime || "audio/webm";
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      stopMediaStream();
      mediaRecorderRef.current = null;

      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) return;
      void transcribeAudio(blob);
    };
    recorder.onerror = () => {
      setIsRecording(false);
      stopMediaStream();
      mediaRecorderRef.current = null;
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
    };

    try {
      recorder.start();
      setIsRecording(true);
      // 保険: 最大 MAX_RECORDING_MS で自動停止
      recordingTimeoutRef.current = setTimeout(() => {
        try { recorder.stop(); } catch {}
      }, MAX_RECORDING_MS);
    } catch {
      stopMediaStream();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  };

  // selectedUserが変わったらチャットをリセット
  useEffect(() => {
    setMessages([
      {
        id: "1",
        role: "assistant",
        content: `こんにちは！${selectedUser}の家計簿AIアシスタントです。\n\n「スタバで700円使った」のように話しかけると支出を記録できます。「今月の残り予算は？」と聞くと分析結果をお答えします。\n\n※このチャット履歴は画面を離れるとリセットされます。`,
        timestamp: new Date(),
      }
    ]);
    lastRecordedIdRef.current = null;
  }, [selectedUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || sendingRef.current) return;
    sendingRef.current = true;

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
      ...(m.functionCalls && m.functionCalls.length > 0 && { functionCalls: m.functionCalls }),
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
          history: historyForApi,
          lastRecordedId: lastRecordedIdRef.current,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || `API error: ${response.status}`);
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
        ...(data.functionCalls && { functionCalls: data.functionCalls }),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("AI応答エラー:", error);
      const errText = error instanceof Error ? error.message : "不明なエラー";
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `エラーが発生しました: ${errText}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      sendingRef.current = false;
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
                    {charActive && charAssets ? (
                      <CharacterImage
                        src={charAssets.avatar}
                        alt={characterName || "AI"}
                        width={20}
                        height={20}
                        className="rounded-full"
                        fallback={<Sparkles className="h-4 w-4 text-purple-400" />}
                      />
                    ) : (
                      <Sparkles className="h-4 w-4 text-purple-400" />
                    )}
                    <span className="text-xs text-purple-400 font-semibold">{charActive && characterName ? characterName : "AI"}</span>
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
                {charActive && charAssets ? (
                  <CharacterImage
                    src={charAssets.avatar}
                    alt="Loading"
                    width={24}
                    height={24}
                    className="animate-bounce rounded-full"
                    fallback={<Loader2 className="h-5 w-5 animate-spin text-purple-400" />}
                  />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                )}
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
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSend(); }}
              placeholder="メッセージを入力..."
              className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder:text-gray-400"
              disabled={isLoading}
            />
            {speechSupported && (
              <Button
                type="button"
                onClick={startVoiceInput}
                disabled={isLoading || isTranscribing}
                variant="outline"
                className={`border-slate-600 bg-slate-700/50 hover:bg-slate-600/50 px-3 ${isRecording ? 'border-red-500 bg-red-500/10' : ''}`}
                title={isRecording ? '録音中（タップで停止）' : isTranscribing ? '書き起こし中' : '音声入力'}
              >
                {isTranscribing
                  ? <Loader2 className="h-5 w-5 text-slate-300 animate-spin" />
                  : isRecording
                    ? <MicOff className="h-5 w-5 text-red-400 animate-pulse" />
                    : <Mic className="h-5 w-5 text-slate-300" />}
              </Button>
            )}
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
