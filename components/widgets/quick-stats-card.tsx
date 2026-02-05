"use client";

import { LucideIcon } from "lucide-react";

interface QuickStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  colorClass?: string;
}

export function QuickStatsCard({ title, value, icon: Icon, subtitle, colorClass = "from-purple-600 to-blue-600" }: QuickStatsCardProps) {
  return (
    <div className="relative group cursor-pointer">
      <div className="relative p-2.5 rounded-lg bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]">
        <div className="flex items-center gap-2 mb-1">
          <div className={`p-1 rounded-md bg-gradient-to-br ${colorClass}`}>
            <Icon className="w-3 h-3 text-white" />
          </div>
          <p className="text-xs text-gray-400 leading-none">{title}</p>
        </div>
        <div className="ml-7">
          <p className="text-base font-bold text-white leading-tight">{value}</p>
          {subtitle && (
            <p className="text-[10px] text-gray-500 mt-0.5 leading-none">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
