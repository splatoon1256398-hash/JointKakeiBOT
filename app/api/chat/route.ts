import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
  functionCalls?: Array<{ name: string; args: Record<string, unknown>; result: { success: boolean; message: string } }>;
}

interface ChatRequest {
  message: string;
  selectedUser: string;
  displayName: string;
  history: ChatHistoryItem[];
  lastRecordedId: string | null;
}

function getMonthRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: firstDay.toISOString().split("T")[0],
    end: lastDay.toISOString().split("T")[0],
  };
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: "認証に失敗しました" },
        { status: 401 }
      );
    }

    const body: ChatRequest = await request.json();
    const { message, selectedUser, displayName, history, lastRecordedId } =
      body;

    // ===== コンテキスト取得 =====
    const { start, end } = getMonthRange();
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const prevEnd = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(prevMonthEnd.getDate()).padStart(2, "0")}`;

    const [
      { data: expenseData },
      { data: prevExpenseData },
      { data: incomeData },
      { data: budgets },
      { data: savingGoals },
      { data: categories },
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
現在のユーザー名: ${displayName}

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

【🔴 最重要ルール: 毎メッセージ独立処理】
- ユーザーの各メッセージは完全に独立した記録リクエストである
- 過去に「記録しました」と返答済みでも、新しいメッセージに金額があれば必ず recordExpense を呼べ
- 「牛丼 1580円」→記録 → 「水 239円」→ また別の recordExpense を呼べ
- 絶対に「既に記録済み」と判断するな。新メッセージ = 新しい記録

【区分(user_type)の決定ルール】
- 現在の選択区分: 「${selectedUser}」
- ユーザーが区分を指定しなければ、必ず「${selectedUser}」をuser_typeに設定せよ
- 「自分の」「個人」と明言された場合のみ → user_type="${displayName}"
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

【返信スタイル】
- 簡潔で的確な日本語。冗長な説明は不要
- 絵文字は最小限（✅❌📊💰等の機能的なもののみ）
- 登録・修正完了時は必ずサマリーを表示`;

    // ===== Gemini モデル（Function Calling） =====
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [
        {
          functionDeclarations: [
            {
              name: "recordExpense",
              description: "支出を記録する。店名+金額が分かれば即座に呼ぶ",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  user_type: {
                    type: SchemaType.STRING,
                    description: "区分（共同/れん/あかね）",
                  },
                  category_main: {
                    type: SchemaType.STRING,
                    description: "大カテゴリー",
                  },
                  category_sub: {
                    type: SchemaType.STRING,
                    description: "小カテゴリー",
                  },
                  store_name: {
                    type: SchemaType.STRING,
                    description: "店名（ブランド名・店舗名）",
                  },
                  amount: {
                    type: SchemaType.NUMBER,
                    description: "金額",
                  },
                  date: {
                    type: SchemaType.STRING,
                    description: "日付（YYYY-MM-DD）",
                  },
                  memo: {
                    type: SchemaType.STRING,
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
                type: SchemaType.OBJECT,
                properties: {
                  transaction_id: {
                    type: SchemaType.STRING,
                    description:
                      "トランザクションID（省略時は直前の記録）",
                  },
                  amount: {
                    type: SchemaType.NUMBER,
                    description: "修正後の金額",
                  },
                  category_main: {
                    type: SchemaType.STRING,
                    description: "修正後の大カテゴリー",
                  },
                  category_sub: {
                    type: SchemaType.STRING,
                    description: "修正後の小カテゴリー",
                  },
                  store_name: {
                    type: SchemaType.STRING,
                    description: "修正後の店名",
                  },
                  memo: {
                    type: SchemaType.STRING,
                    description: "修正後のメモ",
                  },
                  date: {
                    type: SchemaType.STRING,
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
                type: SchemaType.OBJECT,
                properties: {
                  goal_name: {
                    type: SchemaType.STRING,
                    description: "目標名",
                  },
                  amount: {
                    type: SchemaType.NUMBER,
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
                type: SchemaType.OBJECT,
                properties: {
                  user_type: {
                    type: SchemaType.STRING,
                    description: "区分（共同/れん/あかね）",
                  },
                  category_main: {
                    type: SchemaType.STRING,
                    description: "対象カテゴリー",
                  },
                  monthly_budget: {
                    type: SchemaType.NUMBER,
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
                type: SchemaType.OBJECT,
                properties: {
                  main_category: {
                    type: SchemaType.STRING,
                    description: "大カテゴリー名",
                  },
                  subcategory: {
                    type: SchemaType.STRING,
                    description: "サブカテゴリー名",
                  },
                  icon: {
                    type: SchemaType.STRING,
                    description: "絵文字アイコン",
                  },
                },
                required: ["main_category"],
              },
            },
          ],
        },
      ],
    });

    // ===== チャット履歴構築 =====
    // Function Calling 履歴を正確に再構築（連続送信対応）
    const chatHistory: Array<{ role: "user" | "model"; parts: any[] }> = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "はい、承知しました。家計簿アシスタントとして対応します。" }] },
    ];

    for (const m of history) {
      if (m.role === "user") {
        chatHistory.push({ role: "user", parts: [{ text: m.content }] });
      } else {
        // function call があった場合、Gemini に正確なコンテキストを提供
        if (m.functionCalls && m.functionCalls.length > 0) {
          chatHistory.push({
            role: "model",
            parts: m.functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })),
          });
          chatHistory.push({
            role: "user",
            parts: m.functionCalls.map(fc => ({ functionResponse: { name: fc.name, response: fc.result } })),
          });
        }
        chatHistory.push({ role: "model", parts: [{ text: m.content }] });
      }
    }

    const chat = model.startChat({ history: chatHistory });
    const result = await withRetry(() => chat.sendMessage(message));
    const response = result.response;

    let reply = "";
    let newLastRecordedId = lastRecordedId;
    let shouldRefresh = false;
    const executedFunctionCalls: Array<{ name: string; args: Record<string, unknown>; result: { success: boolean; message: string } }> = [];

    // ===== Function Calling 処理（複数対応） =====
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      for (const functionCall of functionCalls) {
      let functionResult: { success: boolean; message: string } = {
        success: false,
        message: "不明なエラー",
      };
      const args = { ...(functionCall.args as Record<string, unknown>) };

      if (functionCall.name === "recordExpense") {
        if (args.user_type === "自分" || args.user_type === "個人") {
          args.user_type = displayName || selectedUser;
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
              (args.date as string) ||
              new Date().toISOString().split("T")[0],
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
              await fetch(`${origin}/api/push/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: "共同支出が登録されました",
                  body: `${displayName}が共同支出を登録: ${(args.store_name as string) || (args.category_main as string)} ¥${Number(args.amount).toLocaleString()}`,
                  excludeUserId: user.id,
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
              date: new Date().toISOString().split("T")[0],
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
        name: functionCall.name,
        args: { ...(functionCall.args as Record<string, unknown>) },
        result: functionResult,
      });
      } // end for loop

      // すべての関数結果をまとめてAIに返して最終応答を生成
      const finalResult = await withRetry(() => chat.sendMessage(
        executedFunctionCalls.map(fc => ({
          functionResponse: { name: fc.name, response: fc.result as object },
        }))
      ));
      reply = finalResult.response.text();
    } else {
      reply = response.text();
    }

    return NextResponse.json({
      reply,
      lastRecordedId: newLastRecordedId,
      shouldRefresh,
      ...(executedFunctionCalls.length > 0 && { functionCalls: executedFunctionCalls }),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "エラーが発生しました。もう一度お試しください。" },
      { status: 500 }
    );
  }
}
