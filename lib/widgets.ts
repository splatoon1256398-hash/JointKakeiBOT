import {
  UtensilsCrossed,
  Coffee,
  PiggyBank,
  Calendar,
  Banknote,
  ShoppingCart,
  TrendingDown,
  HandCoins,
  LucideIcon,
} from "lucide-react";

export interface WidgetConfig {
  type: string;
  label: string;
  icon: LucideIcon;
  colorClass: string;
  // オプション: カテゴリー指定やゴール指定
  categoryMain?: string;
  categorySub?: string;
  savingGoalId?: string;
  payday?: number; // 給料日（日）
  paydayShift?: "before" | "after"; // 休日ずらし方向
}

export const WIDGET_TYPES: { value: string; label: string; icon: LucideIcon; colorClass: string }[] = [
  { value: "food_budget", label: "食費残高", icon: UtensilsCrossed, colorClass: "from-orange-500 to-red-500" },
  { value: "dining_count", label: "外食回数", icon: Coffee, colorClass: "from-pink-500 to-purple-500" },
  { value: "saving_progress", label: "貯金進捗", icon: PiggyBank, colorClass: "from-green-500 to-emerald-500" },
  { value: "payday", label: "給料日まで", icon: Calendar, colorClass: "from-blue-500 to-cyan-500" },
  { value: "category_budget", label: "カテゴリ残高", icon: ShoppingCart, colorClass: "from-amber-500 to-orange-500" },
  { value: "no_money_day", label: "ノーマネーデー", icon: Banknote, colorClass: "from-teal-500 to-green-500" },
  { value: "total_expense", label: "今月の支出", icon: TrendingDown, colorClass: "from-red-500 to-pink-500" },
  { value: "total_income", label: "今月の収入", icon: HandCoins, colorClass: "from-emerald-500 to-teal-500" },
];

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { type: "food_budget", label: "食費残高", icon: UtensilsCrossed, colorClass: "from-orange-500 to-red-500" },
  { type: "dining_count", label: "外食回数", icon: Coffee, colorClass: "from-pink-500 to-purple-500" },
  { type: "saving_progress", label: "貯金進捗", icon: PiggyBank, colorClass: "from-green-500 to-emerald-500" },
  { type: "payday", label: "給料日まで", icon: Calendar, colorClass: "from-blue-500 to-cyan-500", payday: 25 },
];

// 日本の祝日（固定・簡易版）
const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "元日",
  "02-11": "建国記念の日",
  "02-23": "天皇誕生日",
  "04-29": "昭和の日",
  "05-03": "憲法記念日",
  "05-04": "みどりの日",
  "05-05": "こどもの日",
  "08-11": "山の日",
  "11-03": "文化の日",
  "11-23": "勤労感謝の日",
};

// 春分の日（概算）
function getVernalEquinox(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

// 秋分の日（概算）
function getAutumnalEquinox(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function isHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = date.getDay(); // 0=日

  // 日曜
  if (dayOfWeek === 0) return true;
  // 土曜
  if (dayOfWeek === 6) return true;

  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (FIXED_HOLIDAYS[key]) return true;

  // 春分の日
  if (month === 3 && day === getVernalEquinox(year)) return true;
  // 秋分の日
  if (month === 9 && day === getAutumnalEquinox(year)) return true;

  // 成人の日（1月第2月曜）
  if (month === 1 && dayOfWeek === 1 && day >= 8 && day <= 14) return true;
  // 海の日（7月第3月曜）
  if (month === 7 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
  // 敬老の日（9月第3月曜）
  if (month === 9 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
  // スポーツの日（10月第2月曜）
  if (month === 10 && dayOfWeek === 1 && day >= 8 && day <= 14) return true;

  // 振替休日: 祝日が日曜の場合翌月曜が振替
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayOfWeek === 1 && isFixedHoliday(yesterday)) return true;

  return false;
}

function isFixedHoliday(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return !!FIXED_HOLIDAYS[key];
}

function isWeekendOrHoliday(date: Date): boolean {
  return isHoliday(date);
}

/**
 * 給料日までの日数を計算
 * @param payday 給料日（日にち）
 * @param shift 休日の場合のずらし方向
 */
export function calculateDaysToPayday(payday: number = 25, shift: "before" | "after" = "before"): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 今月の給料日
  let targetDate = new Date(today.getFullYear(), today.getMonth(), payday);

  // 既に今月の給料日を過ぎている場合は来月
  if (targetDate <= today) {
    targetDate = new Date(today.getFullYear(), today.getMonth() + 1, payday);
  }

  // 休日ずらし
  if (shift === "before") {
    while (isWeekendOrHoliday(targetDate)) {
      targetDate.setDate(targetDate.getDate() - 1);
    }
  } else {
    while (isWeekendOrHoliday(targetDate)) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
  }

  const diffMs = targetDate.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getWidgetMeta(type: string) {
  return WIDGET_TYPES.find(w => w.value === type);
}
