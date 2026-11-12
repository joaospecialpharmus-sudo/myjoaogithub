import { test } from "node:test";
import assert from "node:assert/strict";
import { discount, offerState, validateOfferDates } from "../src/debts.js";
test("proposta usa o total e não confunde uma parcela com desconto", () => {
  assert.equal(discount(100000, 40000), 60);
  assert.equal(discount(100000, 120000), -20);
  assert.throws(() => discount(0, 1));
});
test("validade vencida não aparece como oferta atual; validade desconhecida não é confirmada", () => {
  assert.equal(
    offerState({ valid_until: "2026-01-01" }, "2026-01-02"),
    "expired",
  );
  assert.equal(offerState({ valid_until: null }, "2026-01-02"), "recorded");
  assert.equal(
    offerState({ valid_until: "2026-01-02" }, "2026-01-02"),
    "recorded",
  );
  assert.throws(() => validateOfferDates("2026-01-02", "2026-01-01"));
});
