"use client";

import { supabase } from "@/lib/supabase";
import type { ExpenseItem } from "@/lib/gemini";

interface BudgetAlertSourceItem {
  categoryMain: string;
}

/**
 * After a new expense is saved, check whether any of its categories pushed
 * the user over 80% / 100% of their monthly budget and send a Push alert.
 * Already-sent alerts for the same month/category/threshold are skipped
 * (tracked in `budget_alert_logs`).
 *
 * Designed to be called fire-and-forget from the save handler. Errors are
 * logged but never thrown back to the caller.
 */
export async function runBudgetAlertCheck(params: {
  userId: string;
  userType: string;
  savedItems: Array<BudgetAlertSourceItem | ExpenseItem>;
  accessToken: string;
}): Promise<void> {
  const { userId, userType, savedItems, accessToken } = params;

  try {
    const now = new Date();
    const alertMonth = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}`;
    const monthStart = `${alertMonth}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthEnd = `${alertMonth}-${String(lastDay.getDate()).padStart(2, "0")}`;

    const affectedCategories = new Set(
      savedItems.map((item) => item.categoryMain),
    );

    const { data: budgets } = await supabase
      .from("budgets")
      .select("category_main, monthly_budget")
      .eq("user_type", userType);

    if (!budgets || budgets.length === 0) return;

    const relevantBudgets = budgets.filter((b) =>
      affectedCategories.has(b.category_main),
    );
    if (relevantBudgets.length === 0) return;

    const { data: monthExpenses } = await supabase
      .from("transactions")
      .select("amount, category_main, items")
      .eq("user_type", userType)
      .eq("type", "expense")
      .gte("date", monthStart)
      .lte("date", monthEnd);

    // Per-category spent totals (items JSON takes precedence when present)
    const spentMap: Record<string, number> = {};
    monthExpenses?.forEach((t) => {
      if (t.items && Array.isArray(t.items) && t.items.length > 0) {
        (t.items as Array<{ categoryMain: string; amount: number }>).forEach(
          (item) => {
            spentMap[item.categoryMain] =
              (spentMap[item.categoryMain] || 0) + item.amount;
          },
        );
      } else {
        spentMap[t.category_main] =
          (spentMap[t.category_main] || 0) + t.amount;
      }
    });

    const { data: existingLogs } = await supabase
      .from("budget_alert_logs")
      .select("category_main, alert_type")
      .eq("user_id", userId)
      .eq("user_type", userType)
      .eq("alert_month", alertMonth);

    const sentSet = new Set(
      (existingLogs || []).map((l) => `${l.category_main}:${l.alert_type}`),
    );

    const alerts: string[] = [];
    const newLogs: Array<{
      user_id: string;
      user_type: string;
      category_main: string;
      alert_type: string;
      alert_month: string;
    }> = [];

    for (const budget of relevantBudgets) {
      const spent = spentMap[budget.category_main] || 0;
      const pct =
        budget.monthly_budget > 0
          ? (spent / budget.monthly_budget) * 100
          : 0;
      const remaining = budget.monthly_budget - spent;

      if (pct >= 100 && !sentSet.has(`${budget.category_main}:100`)) {
        alerts.push(
          `⚠️ ${budget.category_main}の予算を超過しました（¥${(-remaining).toLocaleString()}オーバー）`,
        );
        newLogs.push({
          user_id: userId,
          user_type: userType,
          category_main: budget.category_main,
          alert_type: "100",
          alert_month: alertMonth,
        });
      } else if (
        pct >= 80 &&
        pct < 100 &&
        !sentSet.has(`${budget.category_main}:80`)
      ) {
        alerts.push(
          `⚠ ${budget.category_main}があと¥${remaining.toLocaleString()}で上限です`,
        );
        newLogs.push({
          user_id: userId,
          user_type: userType,
          category_main: budget.category_main,
          alert_type: "80",
          alert_month: alertMonth,
        });
      }
    }

    if (alerts.length === 0) return;

    await fetch("/api/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: "予算アラート",
        body: alerts.join("\n"),
        targetUserId: userId,
        notificationType: "budget_alert",
        url: `/?page=kakeibo&tab=analysis`,
      }),
    });

    if (newLogs.length > 0) {
      await supabase.from("budget_alert_logs").insert(newLogs);
    }
  } catch (err) {
    console.error("予算アラートチェックエラー:", err);
  }
}
