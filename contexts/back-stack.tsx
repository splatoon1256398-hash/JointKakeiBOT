"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type BackHandler = () => void;

interface BackStackValue {
  /** ハンドラをスタックに push。返り値を呼ぶと pop */
  register: (handler: BackHandler) => () => void;
  /** スタック最上位のハンドラを実行。なければ false */
  goBack: () => boolean;
}

const BackStackContext = createContext<BackStackValue | null>(null);

/**
 * グローバルな「戻る」スタック。
 * - 画面内ドリルダウン等の一時的な層がマウント時に register、アンマウント時に解除
 * - goBack() は最上位層に責任を渡す (LIFO)
 * - 何も登録されていなければ goBack は no-op (false 返却)
 */
export function BackStackProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<BackHandler[]>([]);

  const register = useCallback((handler: BackHandler) => {
    stackRef.current.push(handler);
    return () => {
      const idx = stackRef.current.lastIndexOf(handler);
      if (idx >= 0) stackRef.current.splice(idx, 1);
    };
  }, []);

  const goBack = useCallback(() => {
    const handler = stackRef.current[stackRef.current.length - 1];
    if (!handler) return false;
    handler();
    return true;
  }, []);

  const value = useMemo(() => ({ register, goBack }), [register, goBack]);

  return (
    <BackStackContext.Provider value={value}>
      {children}
    </BackStackContext.Provider>
  );
}

/**
 * 戻るハンドラを条件付きで登録する。active=false の間は登録しない。
 * handler が変わるたびに再登録するので、呼び出し側は useCallback 推奨。
 */
export function useBackHandler(handler: BackHandler | null, active: boolean) {
  const ctx = useContext(BackStackContext);
  useEffect(() => {
    if (!ctx || !active || !handler) return;
    return ctx.register(handler);
  }, [ctx, active, handler]);
}

export function useBackStack(): BackStackValue {
  const ctx = useContext(BackStackContext);
  if (!ctx) {
    throw new Error("useBackStack must be used within BackStackProvider");
  }
  return ctx;
}
