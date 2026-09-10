export type TranscriptEntry = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  corrected?: boolean;
};

// Event IDs identify revisions of a turn, not unique chunks. A correction must
// also survive a late/replayed original response after an interruption.
export function upsertTranscript(
  entries: TranscriptEntry[],
  next: TranscriptEntry
): TranscriptEntry[] {
  const index = entries.findIndex((entry) => entry.id === next.id);
  if (index < 0) return [...entries, next];
  if (entries[index].corrected && !next.corrected) return entries;
  return entries.map((entry, i) => (i === index ? next : entry));
}
