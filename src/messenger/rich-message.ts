import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';
import type { Media } from './model';
export const richMime = 'application/vnd.mnelo.card+json';
export const voteEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'] as const;
const shortText = (max: number) => z.string().trim().min(1).max(max);
export const pollSchema = z
  .object({
    version: z.literal(1),
    type: z.literal('poll'),
    question: shortText(200),
    options: z
      .array(shortText(120))
      .min(2)
      .max(10)
      .refine(
        (options) =>
          new Set(options.map((option) => option.normalize('NFC').toLowerCase())).size ===
          options.length,
      ),
    multiple: z.boolean(),
  })
  .strict();
export const eventSchema = z
  .object({
    version: z.literal(1),
    type: z.literal('event'),
    title: shortText(200),
    start: z.number().int().min(0).max(253402300799999),
    end: z.number().int().min(0).max(253402300799999),
    location: z.string().trim().max(300),
    notes: z.string().trim().max(2000),
  })
  .strict()
  .refine((event) => event.end > event.start && event.end - event.start <= 366 * 86400000);
export const richSchema = z.union([pollSchema, eventSchema]);
export type PollCard = z.infer<typeof pollSchema>;
export type EventCard = z.infer<typeof eventSchema>;
export type RichCard = z.infer<typeof richSchema>;
export function richMedia(card: RichCard): Media {
  const json = JSON.stringify(richSchema.parse(card));
  const bytes = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return {
    name: card.type === 'poll' ? 'poll.mnelo' : 'event.mnelo',
    mime: richMime,
    bytes,
    duration: null,
  };
}
export function readRichMedia(media: Media | null | undefined): RichCard | null {
  if (media?.mime !== richMime || media.bytes.length > 24000) return null;
  try {
    const parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(media.bytes), (c) => c.charCodeAt(0)),
      ),
    );
    const value = richSchema.safeParse(parsed);
    return value.success ? value.data : null;
  } catch {
    return null;
  }
}
export function pollResults(poll: PollCard, reactions: readonly { peer: string; emoji: string }[]) {
  const choices = new Map<string, Set<number>>();
  for (const reaction of reactions) {
    const index = voteEmoji.indexOf(reaction.emoji as (typeof voteEmoji)[number]);
    if (index < 0 || index >= poll.options.length) continue;
    const votes = choices.get(reaction.peer) ?? new Set<number>();
    votes.add(index);
    choices.set(reaction.peer, votes);
  }
  // A participant can never count more than once in a single-answer poll, even with malformed peer input.
  if (!poll.multiple)
    for (const [peer, votes] of choices)
      if (votes.size > 1) choices.set(peer, new Set([Math.min(...votes)]));
  return {
    voters: choices.size,
    counts: poll.options.map(
      (_, index) => [...choices.values()].filter((votes) => votes.has(index)).length,
    ),
    choices,
  };
}
export function googleEventURL(event: EventCard) {
  const value = eventSchema.parse(event),
    stamp = (date: number) =>
      new Date(date)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
  const url = new URL('https://calendar.google.com/calendar/r/eventedit');
  url.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: value.title,
    dates: stamp(value.start) + '/' + stamp(value.end),
    location: value.location,
    details: value.notes,
  }).toString();
  return url.toString();
}
export function eventICS(event: EventCard) {
  const value = eventSchema.parse(event),
    stamp = (date: number) =>
      new Date(date)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
  const escape = (text: string) =>
    text
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mnelo//Events//EN',
    'BEGIN:VEVENT',
    'UID:' + bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value)))) + '@mnelo.app',
    'DTSTAMP:' + stamp(Date.now()),
    'DTSTART:' + stamp(value.start),
    'DTEND:' + stamp(value.end),
    'SUMMARY:' + escape(value.title),
    'LOCATION:' + escape(value.location),
    'DESCRIPTION:' + escape(value.notes),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
    .map(foldICS)
    .join('\r\n');
}

function foldICS(line: string) {
  let result = '',
    width = 0;
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).length;
    if (width + bytes > 75) {
      result += '\r\n ';
      width = 1;
    }
    result += character;
    width += bytes;
  }
  return result;
}
