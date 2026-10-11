import { it } from "node:test";
import assert from "node:assert/strict";
import {
  polynomialValue,
  polynomialDerivative,
  polynomialProduct,
  polynomialSum,
  polynomialScale,
  polynomialRoots,
  polynomialTaylor,
} from "../src/core/polynomial";
const close = (a: number, b: number, t = 1e-9) =>
  assert(Math.abs(a - b) < t, `${a} != ${b}`);
function factors(values: number[]) {
  return values.reduce((p, t) => polynomialProduct(p, [-t, 1]), [1]);
}
it("polynomial values, sums, products and derivatives retain ascending coefficient order", () => {
  const p = polynomialProduct([1, 2], [3, 4]);
  assert.deepEqual(p, [3, 10, 8]);
  close(polynomialValue(p, 0.5), 10);
  assert.deepEqual(polynomialDerivative(p), [10, 16]);
  assert.deepEqual(polynomialSum([1, 2], [3], -1), [-2, 2]);
});
it("linear roots are clipped only when inside the bounded parameter domain", () => {
  assert.deepEqual(polynomialRoots([-2, 1]), []);
  assert.deepEqual(polynomialRoots([1, 1]), []);
  assert.deepEqual(polynomialRoots([0, 1]), [0]);
  assert.deepEqual(polynomialRoots([-1, 1]), [1]);
  close(polynomialRoots([-0.3, 1])[0], 0.3);
});
it("stable quadratics find both interior roots and reject a truly complex pair", () => {
  const r = polynomialRoots(factors([0.25, 0.75]));
  assert.equal(r.length, 2);
  close(r[0], 0.25);
  close(r[1], 0.75);
  assert.deepEqual(polynomialRoots([1, 0, 1]), []);
});
it("repeated quadratic roots do not become fake sign-changing pairs from roundoff", () => {
  const r = polynomialRoots(factors([0.50135, 0.50135]));
  assert.equal(r.length, 1);
  close(r[0], 0.50135);
});
it("derivative isolation retains repeated quintic roots without a sign-change scan", () => {
  const r = polynomialRoots(factors([0.2, 0.2, 0.7, 0.7, 0.7]));
  assert.equal(r.length, 2);
  close(r[0], 0.2);
  close(r[1], 0.7);
});
it("all five distinct roots of a degree-five controlling equation are found", () => {
  const expected = [0.1, 0.25, 0.5, 0.75, 0.9],
    r = polynomialRoots(factors(expected));
  assert.equal(r.length, 5);
  r.forEach((v, i) => close(v, expected[i]));
});
it("root locations do not depend on a polynomial's large or small scalar magnitude", () => {
  const p = factors([0.12, 0.31, 0.67, 0.93]);
  for (const scale of [1e120, 1e-120, -7]) {
    const r = polynomialRoots(polynomialScale(p, scale));
    assert.equal(r.length, 4);
    r.forEach((v, i) => close(v, [0.12, 0.31, 0.67, 0.93][i]));
  }
});
it("endpoint roots and outside roots are distinguished in a higher-degree equation", () => {
  const r = polynomialRoots(factors([-0.5, 0, 1, 1.4]));
  assert.equal(r.length, 2);
  close(r[0], 0);
  close(r[1], 1);
});
it("constant/zero equations and Taylor limits have finite, well-defined results", () => {
  assert.deepEqual(polynomialRoots([0, 0, 0]), []);
  assert.deepEqual(polynomialRoots([8]), []);
  const p = factors([0.3, 0.3]);
  const t = polynomialTaylor(p, 0.3);
  close(t[0], 0);
  close(t[1], 0);
  close(t[2], 1);
});
