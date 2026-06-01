const HIGH_RISK_COUNTRIES = new Set(["NG", "PK", "RU"]);
const TRUSTED_PAYMENT_METHODS = new Set(["card", "apple_pay", "paypal"]);

export function evaluateCheckoutRisk(order) {
  const reasons = [];
  let score = 0;

  if (!order || typeof order !== "object") {
    throw new TypeError("order must be an object");
  }

  if (order.totalCents > 75000) {
    score += 35;
    reasons.push("high_order_value");
  }

  if (order.accountAgeDays < 14) {
    score += 25;
    reasons.push("new_account");
  }

  if (HIGH_RISK_COUNTRIES.has(order.shippingCountry)) {
    score += 20;
    reasons.push("high_risk_shipping_country");
  }

  if (!TRUSTED_PAYMENT_METHODS.has(order.paymentMethod)) {
    score += 20;
    reasons.push("untrusted_payment_method");
  }

  if (order.billingCountry !== order.shippingCountry) {
    score += 10;
    reasons.push("billing_shipping_mismatch");
  }

  const decision =
    score >= 70 ? "manual_review" : score >= 40 ? "step_up_auth" : "approve";

  return {
    decision,
    score,
    reasons,
    requires3ds: decision === "step_up_auth" || decision === "manual_review",
  };
}

export function summarizeDecision(result) {
  return `${result.decision}:${result.score}:${result.reasons.join(",")}`;
}
