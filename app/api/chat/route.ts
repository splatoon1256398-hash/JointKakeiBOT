import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type, type Content, type Part, type Tool } from "@google/genai";
import { validateSelectedUser } from "@/lib/auth";
import { getJSTDateString, getJSTMonthRange, getJSTPrevMonthRange } from "@/lib/date";
import { ChatRequestSchema, parseBody } from "@/lib/server/schemas";
import { AppError, reportError, toErrorPayload } from "@/lib/errors";
import { buildCategoryHints } from "@/lib/server/category-hints";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * リトライ付きGemini呼び出し（最大2回リトライ）
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRetryable = error instanceof Error && (
        error.message?.includes('503') ||
        error.message?.includes('429') ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('UNAVAILABLE') ||
        error.message?.includes('DEADLINE_EXCEEDED')
      );
      if (attempt < maxRetries && isRetryable) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Gemini retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable');
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      throw new AppError("auth_required", 401, "認証が必要です");
    }
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      throw new AppError("auth_invalid", 401, "認証に失敗しました");
    }

    const rawBody = await request.json().catch(() => null);
    const { message, selectedUser, history, lastRecordedId } = parseBody(
      ChatRequestSchema,
      rawBody
    );
    const authDisplayName = typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : (user.email?.split("@")[0] ?? "");

    // ===== selectedUser の認可チェック =====
    if (!validateSelectedUser(selectedUser, authDisplayName)) {
      throw new AppError("forbidden", 403, "許可されていないユーザー区分です");
    }

    // ===== コンテキスト取得 =====
    const { start, end } = getJSTMonthRange();
    const todayJST = getJSTDateString();
    const { start: prevStart, end: prevEnd } = getJSTPrevMonthRange();

    const [
      { data: expenseData },
      { data: prevExpenseData },
      { data: incomeData },
      { data: budgets },
      { data: savingGoals },
      { data: categories },
      categoryHints,
    ] = await Promise.all([
      supabaseAdmin
        .from("transactions")
        .select("amount, category_main")
        .eq("user_type", selectedUser)
        .eq("type", "expense")
        .gte("date", start)
        .lte("date", end),
      supabaseAdmin
        .from("transactions")
        .select("amount, category_main")
        .eq("user_type", selectedUser)
        .eq("type", "expense")
        .gte("date", prevStart)
        .lte("date", prevEnd),
      supabaseAdmin
        .from("transactions")
        .select("amount")
        .eq("user_type", selectedUser)
        .eq("type", "income")
        .gte("date", start)
        .lte("date", end),
      supabaseAdmin
        .from("budgets")
        .select("category_main, monthly_budget")
        .eq("user_type", selectedUser),
      supabaseAdmin
        .from("saving_goals")
        .select("*")
        .eq("user_type", selectedUser),
      supabaseAdmin
        .from("categories")
        .select("main_category, subcategories")
        .order("sort_order"),
      buildCategoryHints(user.id, supabaseAdmin),
    ]);

    const totalExpense =
      expenseData?.reduce((sum, t) => sum + t.amount, 0) || 0;
    const categoryMap: Record<string, number> = {};
    expenseData?.forEach((t) => {
      categoryMap[t.category_main] =
        (categoryMap[t.category_main] || 0) + t.amount;
    });

    const prevTotalExpense =
      prevExpenseData?.reduce((sum, t) => sum + t.amount, 0) || 0;
    const prevCategoryMap: Record<string, number> = {};
    prevExpenseData?.forEach((t) => {
      prevCategoryMap[t.category_main] =
        (prevCategoryMap[t.category_main] || 0) + t.amount;
    });

    const totalIncome =
      incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;

    const budgetMap: Record<string, number> = {};
    budgets?.forEach((b) => {
      budgetMap[b.category_main] = b.monthly_budget;
    });

    // ===== システムプロンプト構築 =====
    const budgetInfo =
      Object.entries(budgetMap)
        .map(([cat, budget]) => {
          const spent = categoryMap[cat] || 0;
          return `${cat}: 予算¥${Number(budget).toLocaleString()} / 支出¥${spent.toLocaleString()} / 残¥${(Number(budget) - spent).toLocaleString()}`;
        })
        .join("\n") || "なし";

    const prevComparison =
      Object.entries(categoryMap)
        .map(([cat, amount]) => {
          const prev = prevCategoryMap[cat] || 0;
          const diff =
            prev > 0 ? Math.round((amount - prev) / prev * 100) : 0;
          return `${cat}: 今月¥${Number(amount).toLocaleString()} (前月比${diff >= 0 ? "+" : ""}${diff}%)`;
        })
        .join("\n") || "";

    interface SavingGoal {
      goal_name: string;
      current_amount: number;
      target_amount: number;
    }

    interface CategoryRow {
      main_category: string;
      subcategories: string[];
    }

    const systemPrompt = `あなたは「${selectedUser}」の家計簿パーソナル執事AIである。
無意味な挨拶や冗長な説明は省き、ユーザーの資産管理を支える「正確なツール」として振る舞え。
現在のユーザー名: ${authDisplayName || "未設定"}
現在の日本時間(JST): ${todayJST}

【現在の状況】
- 今月の支出合計: ¥${totalExpense.toLocaleString()}
- 今月の収入合計: ¥${totalIncome.toLocaleString()}
- 前月の支出合計: ¥${prevTotalExpense.toLocaleString()}
- カテゴリー別予算と支出:
${budgetInfo}
- カテゴリー別前月比:
${prevComparison}
- 貯金目標: ${savingGoals?.map((g: SavingGoal) => `${g.goal_name}(¥${g.current_amount?.toLocaleString()}/¥${g.target_amount?.toLocaleString()} = ${g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0}%)`).join(", ") || "なし"}

【利用可能なカテゴリー】
${categories?.map((c: CategoryRow) => `- ${c.main_category}: ${c.subcategories?.join(", ")}`).join("\n") || "- その他: その他"}
${categoryHints ? `\n${categoryHints}\n` : ""}
【🔴 最重要ルール: 毎メッセージ独立処理】
- ユーザーの各メッセージは完全に独立した記録リクエストである
- 過去に「記録しました」と返答済みでも、新しいメッセージに金額があれば必ず recordExpense を呼べ
- 「牛丼 1580円」→記録 → 「水 239円」→ また別の recordExpense を呼べ
- 絶対に「既に記録済み」と判断するな。新メッセージ = 新しい記録
- ❗recordExpense関数を呼ばずに「記録しました」というテキストだけ返すのは絶対禁止
- recordExpense関数を実際に呼び出さない限り、DBには何も記録されない。テキストで記録完了と言うだけでは不十分

【区分(user_type)の決定ルール】
- 現在の選択区分: 「${selectedUser}」
- ユーザーが区分を指定しなければ、必ず「${selectedUser}」をuser_typeに設定せよ
- 「自分の」「個人」と明言された場合のみ → user_type="${authDisplayName || selectedUser}"
- 「共同の」「共同で」と明言された場合のみ → user_type="共同"
- 迷ったら聞き返さず「${selectedUser}」を使え

【コア機能1: 爆速入力】
- 支出記録: 金額が分かれば即座にrecordExpenseを呼ぶ。聞き返すな。
  - 「ドミノピザ チーズピザ 4500円」→ store_name="ドミノピザ", memo="チーズピザ", amount=4500
  - 「マクドナルド 500円」→ store_name="マクドナルド", memo="", amount=500
  - 「コンビニでお茶 150円」→ store_name="コンビニ", memo="お茶", amount=150
  - 「豚肉 500円」→ store_name="", memo="豚肉", amount=500（店名不明→空文字）
  - 店名＝ブランド名・店舗名。メモ＝購入した商品・詳細。店名だけの場合はmemo=""

【🚨 絶対厳守: 捏造禁止】
- ユーザーが明示していない情報を推測・捏造してはならない
- store_nameはユーザーが述べた店名のみ使用。述べていなければ store_name="" にせよ
  - ❌「豚肉 500円」→ store_name="スーパー」（捏造）
  - ✅「豚肉 500円」→ store_name=""（正しい）
- カテゴリーの推測は許可する（食品→食費/食料品 等）が、店名・金額の捏造は禁止
- 不要な挨拶・アドバイス・雑談は一切しない。記録と分析のみに集中せよ

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

【コア機能4.5: 固定費・口座の追加】
- 「Netflix 1490円 毎月12日 追加して」→ addFixedExpense を呼ぶ
  - 「送金として」「月次送金」と明言されたら kind="budget_transfer"、それ以外は kind="expense"
  - user_type は区分ルール準拠 (「共同」「れん」「あかね」)
- 「楽天銀行を登録」「メイン口座に三井住友」→ addBankAccount を呼ぶ
  - 「メイン」と明言されたら is_main=true
- 銀行名/金額/支払日のいずれかが不足していたら一度だけ聞き返す

【コア機能5: 画面遷移 (コンシェルジュ)】
- 「〇〇画面を開いて」「〇〇を見せて」「設定の□□開いて」等の要求で navigateTo を呼ぶ
- page の値:
  - dashboard … ホーム画面
  - kakeibo … 家計簿 (sub_tab="analysis" で分析, "history" で履歴)
  - savings … 貯金
  - chat … このチャット (基本不要)
  - settings … 設定モーダル (sub_tab で内部タブ指定)
- settings の sub_tab:
  - fixed(固定費) / transfers(送金) / budget(予算) / categories(カテゴリ)
  - accounts(口座) / home(ホーム設定) / gmail / push(通知) / other(テーマ・着せ替え)
- 遷移完了後は「〇〇を開きました」と一言で返す。記録系と違い冗長な説明は不要
- 「予算画面」「予算の設定」→ settings + sub_tab=budget
- 「分析見せて」「グラフ」→ kakeibo + sub_tab=analysis
- 「履歴」「取引一覧」→ kakeibo + sub_tab=history

【返信スタイル】
- 簡潔で的確な日本語。冗長な説明は不要
- 絵文字は最小限（✅❌📊💰等の機能的なもののみ）
- ❗マークダウンのテーブル(表)は絶対に使うな。スマホで崩れる
- 登録・修正完了時は以下の箇条書き形式で返せ：

✅ 記録完了
・区分：〇〇
・内容：〇〇
・金額：¥XXX
・カテゴリ： 〇〇 / 〇〇

他にも記録するものがあれば教えてね！

- 複数件登録時は各件を箇条書きで並べる。絶対にテーブルを使わないこと`;

    // ===== Gemini ツール定義 =====
    const tools: Tool[] = [
      {
        functionDeclarations: [
            {
              name: "recordExpense",
              description: "支出を記録する。店名+金額が分かれば即座に呼ぶ",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  user_type: {
                    type: Type.STRING,
                    description: "区分（共同/れん/あかね）",
                  },
                  category_main: {
                    type: Type.STRING,
                    description: "大カテゴリー",
                  },
                  category_sub: {
                    type: Type.STRING,
                    description: "小カテゴリー",
                  },
                  store_name: {
                    type: Type.STRING,
                    description: "店名（ブランド名・店舗名）",
                  },
                  amount: {
                    type: Type.NUMBER,
                    description: "金額",
                  },
                  date: {
                    type: Type.STRING,
                    description: "日付（YYYY-MM-DD）",
                  },
                  memo: {
                    type: Type.STRING,
                    description:
                      "メモ（商品詳細。店名だけの場合は空文字）",
                  },
                },
                required: [
                  "user_type",
                  "category_main",
                  "category_sub",
                  "amount",
                ],
              },
            },
            {
              name: "updateLastTransaction",
              description:
                '直前に記録したトランザクションを修正する。「やっぱり○○円だった」「カテゴリを変えて」等に使う',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  transaction_id: {
                    type: Type.STRING,
                    description:
                      "トランザクションID（省略時は直前の記録）",
                  },
                  amount: {
                    type: Type.NUMBER,
                    description: "修正後の金額",
                  },
                  category_main: {
                    type: Type.STRING,
                    description: "修正後の大カテゴリー",
                  },
                  category_sub: {
                    type: Type.STRING,
                    description: "修正後の小カテゴリー",
                  },
                  store_name: {
                    type: Type.STRING,
                    description: "修正後の店名",
                  },
                  memo: {
                    type: Type.STRING,
                    description: "修正後のメモ",
                  },
                  date: {
                    type: Type.STRING,
                    description: "修正後の日付",
                  },
                },
                required: [],
              },
            },
            {
              name: "addSaving",
              description: "貯金目標に入金する",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  goal_name: {
                    type: Type.STRING,
                    description: "目標名",
                  },
                  amount: {
                    type: Type.NUMBER,
                    description: "入金額",
                  },
                },
                required: ["goal_name", "amount"],
              },
            },
            {
              name: "updateBudget",
              description:
                '予算を設定・変更する。「予算を5万円にして」等',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  user_type: {
                    type: Type.STRING,
                    description: "区分（共同/れん/あかね）",
                  },
                  category_main: {
                    type: Type.STRING,
                    description: "対象カテゴリー",
                  },
                  monthly_budget: {
                    type: Type.NUMBER,
                    description: "月間予算額",
                  },
                },
                required: ["category_main", "monthly_budget"],
              },
            },
            {
              name: "addCategory",
              description:
                'カテゴリを追加・更新する。「カテゴリに推し活を追加して」等',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  main_category: {
                    type: Type.STRING,
                    description: "大カテゴリー名",
                  },
                  subcategory: {
                    type: Type.STRING,
                    description: "サブカテゴリー名",
                  },
                  icon: {
                    type: Type.STRING,
                    description: "絵文字アイコン",
                  },
                },
                required: ["main_category"],
              },
            },
            {
              name: "navigateTo",
              description:
                '画面を遷移する。「分析画面を見せて」「設定の固定費開いて」等',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  page: {
                    type: Type.STRING,
                    description:
                      "遷移先: dashboard(ホーム) | kakeibo(家計簿) | savings(貯金) | chat | settings(設定モーダル)",
                  },
                  sub_tab: {
                    type: Type.STRING,
                    description:
                      "サブタブ。kakeibo: analysis|history。settings: fixed|transfers|budget|categories|accounts|home|gmail|push|other",
                  },
                },
                required: ["page"],
              },
            },
            {
              name: "addFixedExpense",
              description:
                '毎月の固定費 (or 月次送金) を追加する。「Netflix 1490円 毎月12日 追加して」等',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  user_type: {
                    type: Type.STRING,
                    description: "区分（共同/れん/あかね）",
                  },
                  category_main: {
                    type: Type.STRING,
                    description: "大カテゴリー",
                  },
                  category_sub: {
                    type: Type.STRING,
                    description: "小カテゴリー。省略可（先頭のサブを使う）",
                  },
                  amount: {
                    type: Type.NUMBER,
                    description: "金額",
                  },
                  payment_day: {
                    type: Type.NUMBER,
                    description: "毎月の引き落とし日 (1-31)",
                  },
                  memo: {
                    type: Type.STRING,
                    description: "メモ (サービス名等)",
                  },
                  kind: {
                    type: Type.STRING,
                    description:
                      "種別: expense(固定費, 既定) | budget_transfer(月次送金)",
                  },
                },
                required: [
                  "user_type",
                  "category_main",
                  "amount",
                  "payment_day",
                ],
              },
            },
            {
              name: "addBankAccount",
              description:
                '銀行口座をマスターに追加する。「楽天銀行を登録」「メインに三井住友銀行」等',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  bank_name: {
                    type: Type.STRING,
                    description: "銀行名",
                  },
                  icon: {
                    type: Type.STRING,
                    description: "絵文字アイコン (省略時 🏦)",
                  },
                  is_main: {
                    type: Type.BOOLEAN,
                    description: "メイン口座フラグ (省略時 false)",
                  },
                  account_last4: {
                    type: Type.STRING,
                    description: "口座番号下4桁",
                  },
                },
                required: ["bank_name"],
              },
            },
          ],
        },
      ];

    const VALID_PAGES = new Set([
      "dashboard",
      "kakeibo",
      "savings",
      "chat",
      "settings",
    ]);
    const VALID_SUB_TABS: Record<string, Set<string>> = {
      kakeibo: new Set(["analysis", "history"]),
      settings: new Set([
        "fixed",
        "transfers",
        "budget",
        "categories",
        "accounts",
        "home",
        "gmail",
        "push",
        "other",
      ]),
    };
    const PAGE_LABELS: Record<string, string> = {
      dashboard: "ホーム",
      kakeibo: "家計簿",
      savings: "貯金",
      chat: "チャット",
      settings: "設定",
    };
    const SUB_TAB_LABELS: Record<string, string> = {
      analysis: "分析",
      history: "履歴",
      fixed: "固定費",
      transfers: "送金",
      budget: "予算",
      categories: "カテゴリ",
      accounts: "口座",
      home: "ホーム",
      gmail: "Gmail",
      push: "通知",
      other: "その他",
    };

    // ===== チャット履歴構築 =====
    const chatHistory: Content[] = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "はい、承知しました。家計簿アシスタントとして対応します。" }] },
    ];

    for (const m of history) {
      if (m.role === "user") {
        chatHistory.push({ role: "user", parts: [{ text: m.content }] });
      } else {
        if (m.content && m.content.trim()) {
          chatHistory.push({ role: "model", parts: [{ text: m.content }] });
        }
      }
    }

    // ===== 第1回 Gemini 呼び出し =====
    let response;
    try {
      response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...chatHistory, { role: "user", parts: [{ text: message }] }],
        config: { tools },
      }));
    } catch (geminiError) {
      const errDetail = geminiError instanceof Error ? geminiError.message : String(geminiError);
      console.error("[Chat] Gemini generateContent failed:", errDetail);
      return NextResponse.json({
        reply: `AI接続エラーが発生しました。(${errDetail.substring(0, 100)})\nしばらく待ってからもう一度お試しください。`,
        lastRecordedId,
        shouldRefresh: false,
      });
    }

    // デバッグログ
    console.log(`[Chat] Response received. finishReason: ${response.candidates?.[0]?.finishReason}`);

    let reply = "";
    let newLastRecordedId = lastRecordedId;
    let shouldRefresh = false;
    const executedFunctionCalls: Array<{ name: string; args: Record<string, unknown>; result: { success: boolean; message: string } }> = [];

    // ===== Function Calling 処理（複数対応） =====
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const functionCall of functionCalls) {
      let functionResult: { success: boolean; message: string } = {
        success: false,
        message: "不明なエラー",
      };
      const args = { ...(functionCall.args as Record<string, unknown>) };

      if (functionCall.name === "recordExpense") {
        if (args.user_type === "自分" || args.user_type === "個人") {
          args.user_type = authDisplayName || selectedUser;
        }
        // カテゴリをDBで検証
        let catMain = (args.category_main as string) || "その他";
        let catSub = (args.category_sub as string) || "その他";
        const catMap: Record<string, string[]> = {};
        categories?.forEach((c: CategoryRow) => {
          catMap[c.main_category] = c.subcategories || [];
        });
        if (!catMap[catMain]) catMain = "その他";
        const validSubs = catMap[catMain] || ["その他"];
        if (!validSubs.includes(catSub)) catSub = validSubs[0] || "その他";

        const { data: inserted, error } = await supabaseAdmin
          .from("transactions")
          .insert({
            user_id: user.id,
            user_type: (args.user_type as string) || selectedUser,
            type: "expense",
            date:
              (args.date as string) || todayJST,
            category_main: catMain,
            category_sub: catSub,
            store_name: (args.store_name as string) || "",
            amount: args.amount as number,
            memo: (args.memo as string) || "",
          })
          .select("id")
          .single();

        if (error) {
          functionResult = { success: false, message: "記録に失敗しました" };
        } else {
          newLastRecordedId = inserted?.id || null;
          shouldRefresh = true;
          functionResult = {
            success: true,
            message: `${(args.user_type as string) || selectedUser}の支出を記録しました！`,
          };
          // 共同支出のPush通知
          const userType = (args.user_type as string) || selectedUser;
          if (userType === "共同") {
            try {
              const origin = new URL(request.url).origin;
              const transactionDate = ((args.date as string) || todayJST).substring(0, 10);
              await fetch(`${origin}/api/push/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "" },
                body: JSON.stringify({
                  title: "共同支出が登録されました",
                  body: `${authDisplayName || "ユーザー"}が共同支出を登録: ${(args.store_name as string) || (args.category_main as string)} ¥${Number(args.amount).toLocaleString()}`,
                  excludeUserId: user.id,
                  notificationType: "joint_expense_alert",
                  url: `/?page=kakeibo&tab=history&date=${transactionDate}${newLastRecordedId ? `&txId=${newLastRecordedId}` : ""}`,
                }),
              });
            } catch (pushErr) {
              console.error("Push通知送信エラー:", pushErr);
            }
          }
        }
      } else if (functionCall.name === "updateLastTransaction") {
        const targetId = (args.transaction_id as string) || lastRecordedId;
        if (!targetId) {
          functionResult = {
            success: false,
            message:
              "修正対象のトランザクションが見つかりません。",
          };
        } else {
          // 所有確認: 本人のトランザクションのみ修正可能
          const { data: txRow } = await supabaseAdmin
            .from("transactions")
            .select("user_id")
            .eq("id", targetId)
            .single();

          if (!txRow || txRow.user_id !== user.id) {
            functionResult = {
              success: false,
              message: "修正対象のトランザクションが見つかりません。",
            };
          } else {
          const updates: Record<string, unknown> = {};
          if (args.amount !== undefined) updates.amount = args.amount;
          if (args.category_main)
            updates.category_main = args.category_main;
          if (args.category_sub)
            updates.category_sub = args.category_sub;
          if (args.store_name !== undefined)
            updates.store_name = args.store_name;
          if (args.memo !== undefined) updates.memo = args.memo;
          if (args.date) updates.date = args.date;

          if (Object.keys(updates).length === 0) {
            functionResult = {
              success: false,
              message: "修正項目が指定されていません。",
            };
          } else {
            const { error } = await supabaseAdmin
              .from("transactions")
              .update(updates)
              .eq("id", targetId);

            if (error) {
              functionResult = {
                success: false,
                message: "修正に失敗しました",
              };
            } else {
              shouldRefresh = true;
              functionResult = {
                success: true,
                message: `トランザクション(${targetId})を修正しました！`,
              };
            }
          }
          }
        }
      } else if (functionCall.name === "addSaving") {
        const { data: goals } = await supabaseAdmin
          .from("saving_goals")
          .select("*")
          .eq("user_type", selectedUser)
          .eq("goal_name", args.goal_name as string)
          .single();

        if (!goals) {
          functionResult = {
            success: false,
            message: `目標「${args.goal_name}」が見つかりませんでした`,
          };
        } else {
          const newAmount =
            (goals.current_amount as number) + (args.amount as number);
          const { error } = await supabaseAdmin
            .from("saving_goals")
            .update({ current_amount: newAmount })
            .eq("id", goals.id);

          if (error) {
            functionResult = {
              success: false,
              message: "入金に失敗しました",
            };
          } else {
            // saving_logsに記録
            await supabaseAdmin.from("saving_logs").insert({
              goal_id: goals.id,
              user_id: user.id,
              user_type: selectedUser,
              type: "deposit",
              amount: args.amount as number,
              memo: `AIチャットから入金`,
              date: todayJST,
            }).then(({ error: logErr }) => {
              if (logErr) console.warn("saving_logs insert error:", logErr);
            });
            const remaining =
              (goals.target_amount as number) - newAmount;
            shouldRefresh = true;
            functionResult = {
              success: true,
              message: `${args.goal_name}に¥${Number(args.amount).toLocaleString()}を入金しました！残り¥${remaining.toLocaleString()}です。`,
            };
          }
        }
      } else if (functionCall.name === "updateBudget") {
        if (!args.user_type) args.user_type = selectedUser;
        const { data: existing } = await supabaseAdmin
          .from("budgets")
          .select("id")
          .eq("user_type", args.user_type as string)
          .eq("category_main", args.category_main as string)
          .single();

        if (existing) {
          const { error } = await supabaseAdmin
            .from("budgets")
            .update({ monthly_budget: args.monthly_budget as number })
            .eq("id", existing.id);
          if (error) {
            functionResult = {
              success: false,
              message: "予算の更新に失敗しました",
            };
          } else {
            shouldRefresh = true;
            functionResult = {
              success: true,
              message: `${args.category_main}の予算を¥${Number(args.monthly_budget).toLocaleString()}に設定しました。`,
            };
          }
        } else {
          const { error } = await supabaseAdmin
            .from("budgets")
            .insert({
              user_type: args.user_type as string,
              category_main: args.category_main as string,
              monthly_budget: args.monthly_budget as number,
            });
          if (error) {
            functionResult = {
              success: false,
              message: "予算の更新に失敗しました",
            };
          } else {
            shouldRefresh = true;
            functionResult = {
              success: true,
              message: `${args.category_main}の予算を¥${Number(args.monthly_budget).toLocaleString()}に設定しました。`,
            };
          }
        }
      } else if (functionCall.name === "addFixedExpense") {
        if (args.user_type === "自分" || args.user_type === "個人") {
          args.user_type = authDisplayName || selectedUser;
        }
        const userType = String(args.user_type || selectedUser);
        const catMain = String(args.category_main || "その他");
        const catMap: Record<string, string[]> = {};
        categories?.forEach((c: CategoryRow) => {
          catMap[c.main_category] = c.subcategories || [];
        });
        const validSubs = catMap[catMain] || ["その他"];
        let catSub = String(args.category_sub || "");
        if (!catSub || !validSubs.includes(catSub)) catSub = validSubs[0] || "その他";
        const amount = Number(args.amount || 0);
        const paymentDay = Number(args.payment_day || 0);
        const kind = String(args.kind || "expense");

        if (amount <= 0 || paymentDay < 1 || paymentDay > 31) {
          functionResult = {
            success: false,
            message: "金額と支払日 (1-31) を確認してください",
          };
        } else if (kind !== "expense" && kind !== "budget_transfer") {
          functionResult = {
            success: false,
            message: `不明な種別: ${kind}`,
          };
        } else {
          const splitRatio =
            userType === "共同"
              ? { れん: 50, あかね: 50 }
              : userType === "れん"
                ? { れん: 100 }
                : userType === "あかね"
                  ? { あかね: 100 }
                  : {};
          const { error } = await supabaseAdmin.from("fixed_expenses").insert({
            user_id: user.id,
            user_type: userType,
            category_main: catMain,
            category_sub: catSub,
            amount,
            payment_day: paymentDay,
            memo: (args.memo as string) || null,
            is_active: true,
            kind,
            split_ratio: splitRatio,
            transfer_required: userType === "共同",
          });
          if (error) {
            functionResult = {
              success: false,
              message: `固定費の追加に失敗: ${error.message}`,
            };
          } else {
            shouldRefresh = true;
            const label = kind === "budget_transfer" ? "月次送金" : "固定費";
            functionResult = {
              success: true,
              message: `${label}を追加しました: ${catMain} ¥${amount.toLocaleString()} / 毎月${paymentDay}日 (${userType})`,
            };
          }
        }
      } else if (functionCall.name === "addBankAccount") {
        const bankName = String(args.bank_name || "").trim();
        if (!bankName) {
          functionResult = {
            success: false,
            message: "銀行名が指定されていません",
          };
        } else {
          const { data: existing } = await supabaseAdmin
            .from("bank_accounts")
            .select("sort_order")
            .eq("is_active", true)
            .order("sort_order", { ascending: false })
            .limit(1);
          const maxSort = existing?.[0]?.sort_order ?? 0;
          const isMain = Boolean(args.is_main);
          // メイン指定時は他のメインを下ろす
          if (isMain) {
            await supabaseAdmin
              .from("bank_accounts")
              .update({ is_main: false })
              .eq("is_main", true);
          }
          const { error } = await supabaseAdmin.from("bank_accounts").insert({
            bank_name: bankName,
            icon: (args.icon as string) || "🏦",
            color: "#60a5fa",
            account_last4: (args.account_last4 as string) || null,
            is_active: true,
            is_main: isMain,
            sort_order: maxSort + 10,
          });
          if (error) {
            functionResult = {
              success: false,
              message: `口座の追加に失敗: ${error.message}`,
            };
          } else {
            shouldRefresh = true;
            functionResult = {
              success: true,
              message: `銀行口座「${bankName}」を追加しました${isMain ? " (メイン)" : ""}`,
            };
          }
        }
      } else if (functionCall.name === "navigateTo") {
        const page = String(args.page ?? "");
        const subTab = args.sub_tab ? String(args.sub_tab) : "";
        if (!VALID_PAGES.has(page)) {
          functionResult = {
            success: false,
            message: `不明な画面: ${page}`,
          };
        } else {
          const allowed = VALID_SUB_TABS[page];
          if (subTab && allowed && !allowed.has(subTab)) {
            functionResult = {
              success: false,
              message: `${PAGE_LABELS[page]}に「${subTab}」タブはありません`,
            };
          } else {
            const label =
              subTab && SUB_TAB_LABELS[subTab]
                ? `${PAGE_LABELS[page]}の${SUB_TAB_LABELS[subTab]}`
                : PAGE_LABELS[page];
            functionResult = {
              success: true,
              message: `${label}を開きました`,
            };
          }
        }
      } else if (functionCall.name === "addCategory") {
        const { data: existing } = await supabaseAdmin
          .from("categories")
          .select("id, subcategories")
          .eq("main_category", args.main_category as string)
          .single();

        if (existing) {
          if (args.subcategory) {
            const subs = Array.isArray(existing.subcategories)
              ? existing.subcategories
              : [];
            if (!subs.includes(args.subcategory)) {
              subs.push(args.subcategory);
              await supabaseAdmin
                .from("categories")
                .update({ subcategories: subs })
                .eq("id", existing.id);
            }
          }
          shouldRefresh = true;
          functionResult = {
            success: true,
            message: `カテゴリ「${args.main_category}」を更新しました。`,
          };
        } else {
          await supabaseAdmin.from("categories").insert({
            main_category: args.main_category as string,
            icon: (args.icon as string) || "📦",
            subcategories: args.subcategory
              ? [args.subcategory as string]
              : ["その他"],
            sort_order: 99,
          });
          shouldRefresh = true;
          functionResult = {
            success: true,
            message: `カテゴリ「${args.main_category}」を追加しました。`,
          };
        }
      }

      executedFunctionCalls.push({
        name: functionCall.name ?? "",
        args: { ...(functionCall.args as Record<string, unknown>) },
        result: functionResult,
      });
      } // end for loop

      // すべての関数結果をまとめてAIに返して最終応答を生成
      try {
        const modelTurn = response.candidates?.[0]?.content;
        const functionResponseParts: Part[] = executedFunctionCalls.map(
          (fc) => ({
            functionResponse: {
              name: fc.name,
              response: fc.result as Record<string, unknown>,
            },
          }),
        );
        const finalContents: Content[] = [
          ...chatHistory,
          { role: "user", parts: [{ text: message }] },
          ...(modelTurn ? [modelTurn] : []),
          { role: "user", parts: functionResponseParts },
        ];
        const finalResult = await withRetry(() => ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: finalContents,
          config: { tools },
        }));
        reply = finalResult.text ?? "";
      } catch (textErr) {
        console.warn("Final sendMessage failed:", (textErr as Error)?.message?.substring(0, 200));
        reply = "";
      }

      // AIがテキストを返さなかった場合、関数実行結果からデフォルトメッセージを構築
      if (!reply.trim()) {
        const summaries = executedFunctionCalls.map(fc => fc.result.message);
        reply = summaries.join("\n");
      }
    } else {
      try {
        reply = response.text ?? "";
      } catch (textErr) {
        console.warn("[Chat] response.text failed:", (textErr as Error)?.message);
        reply = "";
      }
    }

    // ガード: AIがrecordExpenseを呼ばずに「記録完了」テキストだけ返した場合を検出
    if (executedFunctionCalls.length === 0 && /記録完了|記録しました/.test(reply)) {
      console.warn("[Chat] Model returned '記録完了' text without calling recordExpense. Forcing retry hint.");
      reply = "⚠️ 記録処理が正しく実行されませんでした。もう一度送信してください。";
    }

    // 最終ガード: 空返信を防止
    if (!reply.trim()) {
      console.warn("Empty reply detected. functionCalls:", executedFunctionCalls.length,
        "finishReason:", response.candidates?.[0]?.finishReason);
      reply = "すみません、応答の生成に失敗しました。もう一度お試しください。";
    }

    return NextResponse.json({
      reply,
      lastRecordedId: newLastRecordedId,
      shouldRefresh,
      ...(executedFunctionCalls.length > 0 && { functionCalls: executedFunctionCalls }),
    });
  } catch (error) {
    reportError("chat", error);
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}
