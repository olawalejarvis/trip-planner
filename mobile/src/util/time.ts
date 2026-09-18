// The backend deals in "seconds past local midnight" (GTFS-style, can exceed
// 86400 for after-midnight trips) and YYYYMMDD dates. These convert to/from
// plain JS Dates for the UI.

import type { Itinerary } from "../api/types";

// Metrobus advises being at the stop 5 minutes before the scheduled departure.
const STOP_ARRIVAL_BUFFER_S = 5 * 60;

/** When to leave the origin to make the first bus with that 5-minute buffer
 * built in. Null for itineraries with no transit leg (pure walking) or that
 * board right where they start (no walk leg first). */
export function leaveByTime(itinerary: Itinerary): number | null {
  const [first, second] = itinerary.legs;
  if (!first || first.kind !== "walk" || !second || second.kind !== "transit") return null;
  return second.board_time - first.duration_s - STOP_ARRIVAL_BUFFER_S;
}

export function dateToSecondsSinceMidnight(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

export function dateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function secondsToClockLabel(totalSeconds: number): string {
  const wrapped = ((totalSeconds % 86400) + 86400) % 86400;
  const hours24 = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function hhmmssToClockLabel(hhmmss: string): string {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return secondsToClockLabel(h * 3600 + m * 60 + s);
}

export function dateLabel(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function durationLabel(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}
