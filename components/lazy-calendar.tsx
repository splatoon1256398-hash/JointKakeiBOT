"use client";

/**
 * Phase 4-A: react-calendar + その CSS を初期バンドルから除外するためのラッパー。
 *
 * このファイルは history.tsx から dynamic import されるので、
 * カレンダーモードを開くまで loader に入らない。
 * → react-calendar 本体 (~100KB) と Calendar.css (~4KB) の両方が
 *    遅延ロードされる。
 */

import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

export default Calendar;
