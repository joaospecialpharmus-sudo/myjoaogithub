// Converte palavras reconhecidas em linhas usando coordenadas, sem depender da ordem dos blocos do OCR.
export function ocrTsvToLines(tsv, { page = 1, offset = 0 } = {}) {
  const words = [];
  for (const row of tsv.trim().split(/\r?\n/).slice(1)) {
    const fields = row.split("\t");
    if (fields[0] !== "5") continue;
    const [left, top, width, height, confidence] = fields
      .slice(6, 11)
      .map(Number);
    const text = fields.slice(11).join("\t").trim();
    if (
      !text ||
      ![left, top, width, height, confidence].every(Number.isFinite) ||
      height <= 0
    )
      continue;
    words.push({ text, x: left, y: top + height / 2, height, width });
  }
  words.sort((a, b) => a.y - b.y || a.x - b.x);
  const groups = [];
  for (const word of words) {
    const tolerance = Math.max(3, word.height * 0.55);
    let group = groups.find(
      (g) => Math.abs(g.y - word.y) <= Math.max(tolerance, g.height * 0.55),
    );
    if (!group) {
      group = { y: word.y, height: word.height, words: [] };
      groups.push(group);
    }
    group.words.push(word);
  }
  groups.sort((a, b) => a.y - b.y);
  return groups.map((group, index) => ({
    text: group.words
      .sort((a, b) => a.x - b.x)
      .map((w) => w.text)
      .join(" "),
    bounds: {
      top: Math.min(...group.words.map((w) => w.y - w.height / 2)),
      bottom: Math.max(...group.words.map((w) => w.y + w.height / 2)),
    },
    page,
    column: 0,
    sourceIndex: `ocr:${page}:${offset + index}`,
    segmentOffset: 0,
  }));
}
