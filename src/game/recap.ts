import type { LogEntry } from './types';

const GAP = 3 * 60 * 60 * 1000; // 3 hours without log entries = a new session
/** Log lines worth retelling; travel, shopping, rolls and the like are left out. */
const KEEP = /reached level|evolved|joined the team|Quest complete|defeated the boss|cleared|stepped out|The team met|purified|Mega Evolved|fainted in|Graduation day|Creative moment|Blessing|graduation spar|passed its Mega Trial|approved/i;

/** Highlights of the last finished session, oldest first. `entries` are newest first, as the log stores them. */
export function recapLines(entries: LogEntry[], now = Date.now(), max = 8): string[] {
  if (!entries.length) return [];
  // Split into sessions, newest first.
  const sessions: LogEntry[][] = [[entries[0]]];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].t - entries[i].t > GAP) sessions.push([]);
    sessions[sessions.length - 1].push(entries[i]);
  }
  // Recap the newest session that has ended; if the only one is still going, recap it so far.
  const last = sessions.find(s => now - s[0].t > GAP) || sessions[0];
  const picks = last.filter(e => KEEP.test(e.text)).reverse();
  return picks.slice(-max).map(e => e.text);
}
