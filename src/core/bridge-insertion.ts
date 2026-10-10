import { referenceLayout } from "./design-basis";
import { bridgeAt } from "./bridge-profile";
import {
  controlPoints,
  getNode,
  validateGenerationBudget,
  roadHalfWidth,
  type Project,
} from "./model";
import { sampleAlignment, stationAt } from "./curves";
import { splitRoad, detectCrossings } from "./editing";
import { derivative, cubic } from "./math";
export interface BridgeInsertion {
  bridge: string;
  approaches: [string, string];
  joints: [string, string];
  elevation: number;
  deckLength: number;
  approachLengths: [number, number];
}
/** Atomic graph operation: preserves the two existing shared endpoints and the
 * exact XZ cubic, then inserts two level deck joints and three connected pieces.
 * It refuses steep/blocked approaches instead of lifting neighbouring streets.
 */
export function insertConnectedBridge(
  project: Project,
  roadId: string,
  options: { rise?: number; structure?: "steel" | "concrete" } = {},
): BridgeInsertion {
  const original = project.roads.find((r) => r.id === roadId);
  if (!original) throw new RangeError("Select an existing road alignment.");
  if (original.bridge)
    throw new RangeError(
      "This alignment is already a bridge. Edit its superstructure, or select a ground approach.",
    );
  if (original.driveways.length)
    throw new RangeError(
      "Clear vehicle entries before elevating this alignment, or choose another road.",
    );
  if (original.auxiliaryLane !== "none")
    throw new RangeError(
      "Choose an alignment without an authored speed-change lane before inserting a bridge.",
    );
  const alignment = sampleAlignment(project, original),
    length = alignment.length,
    rise = options.rise ?? referenceLayout.deckElevation,
    deckLength = 64,
    requiredLength = Math.max(600, Math.ceil((3 * rise) / 0.0405 + deckLength));
  if (!Number.isFinite(rise) || rise < 5 || rise > 16)
    throw new RangeError("Bridge rise must be between 5 and 16 metres.");
  if (length < requiredLength)
    throw new RangeError(
      `Connected bridge insertion needs at least ${requiredLength} m for a 64 m deck and approximately 4% approaches at this rise. Use the Connected highway bridge template, or lengthen this alignment.`,
    );
  if (project.roads.length > 498 || project.nodes.length > 1498)
    throw new RangeError(
      "Not enough editor-tile capacity for the bridge approaches.",
    );
  const draft = structuredClone(project),
    r = draft.roads.find((r) => r.id === roadId)!,
    elevation =
      Math.max(
        getNode(draft, r.start).position[1],
        getNode(draft, r.end).position[1],
      ) + rise,
    start = r.start,
    end = r.end;
  const ta = stationAt(alignment, (length - deckLength) / 2).t,
    tb = stationAt(alignment, (length + deckLength) / 2).t;
  const a = splitRoad(draft, r.id, ta),
    rest = draft.roads.find((r) => r.start === a.id && r.end === end)!,
    b = splitRoad(draft, rest.id, (tb - ta) / (1 - ta));
  a.position[1] = b.position[1] = elevation;
  a.name = "Bridge landing · In";
  b.name = "Bridge landing · Out";
  a.crossings = b.crossings = false;
  const approachIn = draft.roads.find(
      (r) => r.start === start && r.end === a.id,
    )!,
    deck = draft.roads.find((r) => r.start === a.id && r.end === b.id)!,
    approachOut = draft.roads.find((r) => r.start === b.id && r.end === end)!;
  for (const piece of [approachIn, deck, approachOut]) {
    piece.bridge = piece.id === deck.id;
    piece.bridgeFrom = 0;
    piece.bridgeTo = 1;
    piece.embankment = piece.id !== deck.id;
    if (piece.roadClass === "street" && piece.markingStyle === "motorway")
      piece.roadClass = "mainline";
    piece.bridgeDepth = Math.max(piece.bridgeDepth, referenceLayout.deckDepth);
    piece.structure = options.structure ?? "steel";
    piece.guardrails = true;
    if (!original.guardrails) {
      piece.railStyle = "boxbeam";
      piece.railHeight = Math.max(0.95, piece.railHeight);
    }
    piece.h1[1] = piece.h2[1] = 0;
    const points = controlPoints(draft, piece),
      alignment = sampleAlignment(draft, piece);
    for (const station of alignment.stations) {
      const d = derivative(points, station.t),
        grade = (Math.abs(d[1]) / Math.max(1e-8, Math.hypot(d[0], d[2]))) * 100;
      if (grade > 4.05)
        throw new RangeError(
          "This curve cannot fit approaches at approximately 4% grade. Lengthen the alignment or reduce the bridge rise.",
        );
    }
  }
  approachIn.name = `${original.name} · Bridge approach in`;
  deck.name = `${original.name} · Connected bridge deck`;
  approachOut.name = `${original.name} · Bridge approach out`;
  const edited = new Set([approachIn.id, deck.id, approachOut.id]);
  for (const crossing of detectCrossings(draft, Infinity)) {
    if (!edited.has(crossing.a) && !edited.has(crossing.b)) continue;
    const a = draft.roads.find((r) => r.id === crossing.a)!,
      b = draft.roads.find((r) => r.id === crossing.b)!,
      ay = cubic(controlPoints(draft, a), crossing.ta)[1],
      by = cubic(controlPoints(draft, b), crossing.tb)[1],
      upper = ay > by ? a : b,
      lower = ay > by ? b : a,
      clearance =
        Math.abs(ay - by) -
        (bridgeAt(upper, ay > by ? crossing.ta : crossing.tb)
          ? upper.bridgeDepth
          : 0.48) -
        Math.max(0.12, 0.04 + (roadHalfWidth(lower) * lower.crossfall) / 100);
    if (clearance < referenceLayout.clearance)
      throw new RangeError(
        "The inserted bridge would conflict with another road. Choose a clear alignment or increase its rise and approach length.",
      );
  }
  validateGenerationBudget(draft);
  project.nodes = draft.nodes;
  project.roads = draft.roads;
  return {
    bridge: deck.id,
    approaches: [approachIn.id, approachOut.id],
    joints: [a.id, b.id],
    elevation,
    deckLength: sampleAlignment(draft, deck).length,
    approachLengths: [
      sampleAlignment(draft, approachIn).length,
      sampleAlignment(draft, approachOut).length,
    ],
  };
}
