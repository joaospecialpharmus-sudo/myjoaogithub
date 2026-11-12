export function discount(original, total) {
  if (
    !Number.isSafeInteger(original) ||
    original <= 0 ||
    !Number.isSafeInteger(total) ||
    total <= 0
  )
    throw Error("Valores inválidos.");
  return Math.round((1 - total / original) * 10000) / 100;
}
export function offerState(offer, today) {
  return offer.valid_until && offer.valid_until < today
    ? "expired"
    : "recorded";
}
export function validateOfferDates(observed, expiry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed) || (expiry && expiry < observed))
    throw Error("A validade não pode ser anterior à data da consulta.");
}
