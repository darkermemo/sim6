// Simple linkify function for safe URL detection and rendering
export function linkifyText(text: string): Array<{ type: 'text' | 'link'; content: string; href?: string }> {
  // Regex for detecting URLs
  const urlRegex = /https?:\/\/[^\s<>{}\\^`"]+/gi;
  const parts: Array<{ type: 'text' | 'link'; content: string; href?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    // Add the URL
    parts.push({
      type: 'link',
      content: match[0],
      href: match[0],
    });

    lastIndex = urlRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return parts;
}
