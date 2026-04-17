"use client";

import { Component, type ReactNode } from "react";

/**
 * クライアント側の未捕捉例外を catch する境界。
 *
 * React 19 + Next.js 15 App Router では error.tsx で segment-level 捕捉もできるが、
 * 本アプリは単一ページ構成でタブ切替 UI のため、Root に置いて常時張っておくのが確実。
 *
 * - 子ツリーで throw された React レンダリングエラー / lifecycle エラーを捕捉
 * - 非同期 (fetch など) の reject はここでは捕捉されない (そちらは AppError で個別処理)
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** カスタムフォールバック UI。未指定ならデフォルト画面。 */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // 将来 Sentry 等に差し替え。現状は console.error のみ。
    console.error("[ErrorBoundary]", error.message, info.componentStack || "");
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-slate-950 text-white">
        <div className="max-w-md w-full rounded-2xl bg-slate-900/80 border border-red-500/30 p-6 space-y-4">
          <h2 className="text-lg font-bold">予期しないエラーが発生しました</h2>
          <p className="text-sm text-white/70 break-words">{error.message}</p>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex-1 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
            >
              再試行
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-sm"
            >
              ページを再読み込み
            </button>
          </div>
        </div>
      </div>
    );
  }
}
