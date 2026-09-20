export type MessageLink = { start: number; end: number; text: string; url: string };

// Parse locally; never fetch a preview or open a destination until it is tapped.
export function messageLinkRanges(body: string): MessageLink[] {
  const links: MessageLink[] = [];
  for (const match of body.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"\u0000-\u001f]+/giu)) {
    let text = match[0].replace(/[.,!?;:'\u2019\u201d]+$/u, '');
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ]) {
      while (text.endsWith(close!) && text.split(close!).length > text.split(open!).length)
        text = text.slice(0, -1);
    }
    try {
      const url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        continue;
      links.push({ start: match.index, end: match.index + text.length, text, url: url.href });
    } catch {
      // Keep malformed addresses as the original, non-interactive text.
    }
  }
  return links;
}

export function messageLinks(body: string): string[] {
  return [...new Set(messageLinkRanges(body).map((link) => link.url))];
}
