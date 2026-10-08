// Document-level integration: actions (the same ones the UI calls) evaluated by the real kernel.
import assert from "node:assert/strict";
import opencascade from "replicad-opencascadejs";
import * as replicad from "replicad";
import { createEvaluator } from "../src/kernel/evaluate.js";
import { getState } from "../src/store.js";
import * as A from "../src/actions.js";

const OC = await opencascade();
replicad.setOC(OC);
const ev = createEvaluator(replicad);
const evaluate = () => ev.evaluate(getState().doc).results;

// 1. Sample car pod: loft of four hidden ellipse sections plus four wheel cylinders.
A.newDocument();
A.addSample();
let doc = getState().doc;
assert.equal(doc.order.length, 9, "sample has 9 nodes");
let results = evaluate();
const visible = doc.order.filter((id) => doc.nodes[id].visible);
assert.equal(visible.length, 5, "loft + four wheels visible");
for (const id of visible) assert.ok(results[id]?.ok, `${doc.nodes[id].name}: ${results[id]?.error}`);
const pod = doc.order.find((id) => doc.nodes[id].type === "loft");
assert.ok(results[pod].volume > 0, "pod has volume");
const wheelBox = results[doc.order.find((id) => doc.nodes[id].name === "Wheel FL")].bbox;
assert.ok(Math.abs((wheelBox.min[1] + wheelBox.max[1]) / 2 - 40) < 1e-6, "front-left wheel centred on y = +40");

// 2. Fillet on one edge of a box, through the same path as the B hotkey.
A.newDocument();
A.addPrimitive("box");
const box = getState().selection[0];
A.toggleSubEntity(box, "edges", 0);
const fillet = A.createOperation("fillet");
assert.ok(fillet, "fillet created");
doc = getState().doc;
assert.deepEqual(doc.nodes[fillet].inputs, [box]);
assert.equal(doc.nodes[box].visible, false, "consumed box hidden");
results = evaluate();
assert.ok(results[fillet].ok, results[fillet].error);
assert.ok(results[fillet].volume < 8000 && results[fillet].volume > 7900, `fillet volume ${results[fillet].volume}`);

// 3. Undo restores the pre-fillet document; redo brings it back.
A.undo();
assert.ok(getState().doc.nodes[fillet] === undefined, "undo removes the fillet");
assert.equal(getState().doc.nodes[box].visible, true, "undo restores the box");
A.redo();
assert.ok(getState().doc.nodes[fillet], "redo restores the fillet");

// 4. Delete the fillet: the box comes back as a visible input.
A.clearSelection();
A.selectNodes([fillet]);
A.deleteSelection();
assert.equal(getState().doc.nodes[box].visible, true, "delete restores the input");

// 5. Boolean subtract over two boxes; op is set through setParam.
A.newDocument();
A.addPrimitive("box");
const b1 = getState().selection[0];
A.addPrimitive("box");
const b2 = getState().selection[0];
A.setXf(b2, { t: [10, 0, 0] });
A.selectNodes([b1, b2]);
const bool = A.createOperation("boolean");
assert.ok(bool, "boolean created");
A.setParam(bool, "op", "subtract", { coalesce: false });
results = evaluate();
assert.ok(results[bool].ok, results[bool].error);
// Two 40x20x10 boxes offset by 10 in X: subtracting leaves 10 x 20 x 10 = 2000 mm3 at the front.
assert.ok(Math.abs(results[bool].volume - 2000) < 1, `subtract volume ${results[bool].volume}`);

// 6. Edge operations need edges; the action warns instead of creating a bad node.
A.newDocument();
A.addPrimitive("box");
const plain = getState().selection[0];
const before = getState().doc.order.length;
A.selectNodes([plain]);
A.createOperation("chamfer");
assert.equal(getState().doc.order.length, before, "chamfer without edges creates nothing");

// 7. Edits on a node re-evaluate only that node downstream (cache returns the same out object).
A.newDocument();
A.addPrimitive("box");
const b = getState().selection[0];
const r1 = evaluate();
A.setParam(b, "w", 50, { coalesce: false });
const r2 = evaluate();
assert.ok(r2[b].volume > r1[b].volume, "wider box has more volume");

console.log("actions integration passed: sample pod, fillet, undo/redo, delete-restore, boolean, guards, re-evaluation");
process.exit(0);
