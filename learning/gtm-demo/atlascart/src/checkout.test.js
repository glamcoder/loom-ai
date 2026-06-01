import assert from "node:assert/strict";
import { evaluateCheckoutRisk, summarizeDecision } from "./checkout.js";

const lowRisk = evaluateCheckoutRisk({
  totalCents: 1299,
  accountAgeDays: 180,
  billingCountry: "US",
  shippingCountry: "US",
  paymentMethod: "card",
});

assert.equal(lowRisk.decision, "approve");
assert.equal(lowRisk.requires3ds, false);
assert.equal(summarizeDecision(lowRisk), "approve:0:");

const mediumRisk = evaluateCheckoutRisk({
  totalCents: 14999,
  accountAgeDays: 3,
  billingCountry: "US",
  shippingCountry: "US",
  paymentMethod: "wire",
});

assert.equal(mediumRisk.decision, "step_up_auth");
assert.equal(mediumRisk.requires3ds, true);
assert.deepEqual(mediumRisk.reasons, ["new_account", "untrusted_payment_method"]);

const highRisk = evaluateCheckoutRisk({
  totalCents: 120000,
  accountAgeDays: 1,
  billingCountry: "US",
  shippingCountry: "NG",
  paymentMethod: "wire",
});

assert.equal(highRisk.decision, "manual_review");
assert.equal(highRisk.requires3ds, true);
assert.ok(highRisk.reasons.includes("high_order_value"));
assert.ok(highRisk.reasons.includes("untrusted_payment_method"));

console.log("AtlasCart checkout tests passed");
