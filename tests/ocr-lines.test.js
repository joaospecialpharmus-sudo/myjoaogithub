import { test } from "node:test";
import assert from "node:assert/strict";
import { ocrTsvToLines } from "../src/ocr-lines.js";
test("OCR recompõe data, descrição e valor pela posição mesmo quando blocos vierem separados", () => {
  const header =
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const word = (x, y, h, t) =>
    `5\t1\t1\t1\t1\t1\t${x}\t${y}\t50\t${h}\t95\t${t}`;
  const lines = ocrTsvToLines(
    [
      header,
      word(500, 99, 20, "20,00"),
      word(20, 100, 18, "07"),
      word(60, 102, 18, "out"),
      word(120, 100, 19, "COMERCIO"),
      word(20, 160, 18, "08 out OUTRO 10,00"),
    ].join("\n"),
    { page: 2 },
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "07 out COMERCIO 20,00");
  assert.equal(lines[0].page, 2);
  assert.ok(lines[0].bounds.bottom > lines[0].bounds.top);
});
