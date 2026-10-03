import stringWidth from "string-width";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Herdr renders each token on one row, without wrapping. Publish two custom
// tokens instead; measure terminal cells, not UTF-16 length or Unicode points.
function prefix(text, width) {
  let used = 0;
  let result = "";
  for (const { segment } of segmenter.segment(text)) {
    const cells = stringWidth(segment);
    if (used + cells > width) break;
    used += cells;
    result += segment;
  }
  return result;
}

export function titleLines(title, width = 30) {
  if (!title) return ["OpenCode", undefined];
  if (stringWidth(title) <= width) return [title, undefined];

  let first = prefix(title, width);
  // Prefer a word boundary, unless it would leave most of the first line empty.
  const boundary = first.lastIndexOf(" ");
  if (boundary > 0 && stringWidth(first.slice(0, boundary)) >= width / 2) {
    first = first.slice(0, boundary);
  }
  let second = title.slice(first.length).trimStart();
  first = first.trimEnd();
  if (stringWidth(second) > width) second = `${prefix(second, width - 1).trimEnd()}…`;
  return [first, second || undefined];
}

export function configuredLineWidth(options = {}) {
  const width = options.titleLineWidth ?? 30;
  if (!Number.isInteger(width) || width < 8 || width > 80) {
    throw new Error("titleLineWidth must be an integer between 8 and 80 terminal columns");
  }
  return width;
}
