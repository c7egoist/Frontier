import {
  createIcons,
  MousePointer2,
  PenTool,
  GitFork,
  Move,
  Magnet,
  Undo2,
  Redo2,
  Columns2,
  Scan,
  PanelLeft,
  SlidersHorizontal,
  Route,
  Layers3,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  Plus,
  Minus,
  Trees,
  Eye,
  EyeOff,
  Keyboard,
  Tag,
  Hand,
  Ruler,
  Grid2x2,
  Sun,
  Focus,
  Maximize,
  Mouse,
  Link2,
  X,
  RefreshCw,
  Triangle,
  Box,
  Save,
  CircleHelp,
  CircleCheck,
  CircleAlert,
  FilePlus2,
  FolderOpen,
  Download,
  Trash2,
  FileJson,
  ArrowUpRight,
  Settings2,
  GitMerge,
  MapPin,
  Lock,
  Info,
  Droplets,
  Shield,
  Waypoints,
  Spline,
  Mountain,
  ArrowRight,
  Check,
  CornerUpRight,
  Cable,
  RotateCcw,
  GripVertical,
} from "lucide";
const icons = {
  MousePointer2,
  PenTool,
  GitFork,
  Move,
  Magnet,
  Undo2,
  Redo2,
  Columns2,
  Scan,
  PanelLeft,
  SlidersHorizontal,
  Route,
  Layers3,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  Plus,
  Minus,
  Trees,
  Eye,
  EyeOff,
  Keyboard,
  Tag,
  Hand,
  Ruler,
  Grid2x2,
  Sun,
  Focus,
  Maximize,
  Mouse,
  Link2,
  X,
  RefreshCw,
  Triangle,
  Box,
  Save,
  CircleHelp,
  CircleCheck,
  CircleAlert,
  FilePlus2,
  FolderOpen,
  Download,
  Trash2,
  FileJson,
  ArrowUpRight,
  Settings2,
  GitMerge,
  MapPin,
  Lock,
  Info,
  Droplets,
  Shield,
  Waypoints,
  Spline,
  Mountain,
  ArrowRight,
  Check,
  CornerUpRight,
  Cable,
  RotateCcw,
  GripVertical,
};
export function refreshIcons() {
  createIcons({ icons, attrs: { "stroke-width": 1.65 } });
}
export const icon = (name: string) =>
  `<i data-lucide="${name}" aria-hidden="true"></i>`;
export const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function assetSketch(type: string): string {
  const colors = {
    road: "#5e705f",
    curb: "#b4c6a7",
    pave: "#899d7f",
    paint: "#d5e2c5",
  };
  const begin =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 72" fill="none">',
    end = "</svg>";
  if (["urban", "arterial", "highway", "path"].includes(type)) {
    const width = type === "arterial" || type === "highway" ? 24 : 15;
    return `${begin}<path d="M-5 68 185 2" stroke="${colors.pave}" stroke-width="${width + 18}"/><path d="M-5 68 185 2" stroke="${colors.curb}" stroke-width="${width + 3}"/><path d="M-5 68 185 2" stroke="${type === "path" ? "#a7b59b" : colors.road}" stroke-width="${width}"/>${type === "path" ? '<path d="M0 55 180 15M0 63 180 23" stroke="#d6e1c4" stroke-width=".5"/>' : `<path d="M-5 68 185 2" stroke="${colors.paint}" stroke-width="1" stroke-dasharray="6 6"/>`}${type === "arterial" || type === "highway" ? `<path d="M-5 62 185 -4M-5 74 185 8" stroke="${colors.paint}" stroke-width=".7" stroke-dasharray="5 6"/>` : ""}${type === "highway" ? '<path d="M-5 51 185 -15M-5 85 185 19" stroke="#cad6c1" stroke-width="1.2"/>' : ""}${end}`;
  }
  if (type === "district")
    return `${begin}<path d="M-5 39H185M90-5V80" stroke="${colors.pave}" stroke-width="25"/><path d="M-5 39H185M90-5V80" stroke="${colors.curb}" stroke-width="17"/><path d="M-5 39H185M90-5V80" stroke="${colors.road}" stroke-width="15"/><path d="M20 39H66M114 39H170M90 2V15M90 61V75" stroke="${colors.paint}" stroke-width="1" stroke-dasharray="6 5"/><rect x="70" y="30" width="40" height="18" rx="4" fill="${colors.road}"/>${end}`;
  if (type === "tee")
    return `${begin}<path d="M-5 30H185M90 30V85" stroke="${colors.pave}" stroke-width="25"/><path d="M-5 30H185M90 30V85" stroke="${colors.curb}" stroke-width="17"/><path d="M-5 30H185M90 30V85" stroke="${colors.road}" stroke-width="15"/><path d="M15 30H63M117 30H170M90 48V78" stroke="${colors.paint}" stroke-width="1" stroke-dasharray="6 5"/>${end}`;
  if (type === "roundabout")
    return `${begin}<path d="M0 36H70M110 36H180M90 0V17M90 55V72" stroke="${colors.pave}" stroke-width="19"/><circle cx="90" cy="36" r="22" stroke="${colors.pave}" stroke-width="19"/><path d="M0 36H70M110 36H180M90 0V17M90 55V72" stroke="${colors.road}" stroke-width="11"/><circle cx="90" cy="36" r="22" stroke="${colors.road}" stroke-width="11"/><circle cx="90" cy="36" r="22" stroke="${colors.paint}" stroke-width=".7" stroke-dasharray="5 4"/>${end}`;
  if (type === "diamond")
    return `${begin}<path d="M-5 37H185" stroke="${colors.curb}" stroke-width="15"/><path d="M-5 37H185" stroke="${colors.road}" stroke-width="12"/><path d="M88 8C70 8 65 33 32 37M92 8c18 0 23 25 56 29M88 66c-18 0-23-25-56-29M92 66c18 0 23-25 56-29" stroke="${colors.curb}" stroke-width="5"/><path d="M88 8C70 8 65 33 32 37M92 8c18 0 23 25 56 29M88 66c-18 0-23-25-56-29M92 66c18 0 23-25 56-29" stroke="${colors.road}" stroke-width="3"/><path d="M92-5V80" stroke="#203e2555" stroke-width="19" transform="translate(3 2)"/><path d="M90-5V80" stroke="${colors.curb}" stroke-width="15"/><path d="M90-5V80" stroke="${colors.road}" stroke-width="12"/><path d="M90-5V80M0 37H72M110 37H180" stroke="${colors.paint}" stroke-width=".7" stroke-dasharray="5 4"/>${end}`;
  if (type === "bridge" || type === "steel")
    return `${begin}<path d="M-10 22 190 6 190 26-10 44Z" fill="${colors.road}" stroke="${colors.curb}" stroke-width="1"/><path d="M-10 44 190 26v6L-10 50Z" fill="${type === "steel" ? "#667c70" : "#94a58a"}"/><path d="m45 43 8-1v28l-8-2Zm76-7 8-1v24l-8 2Z" fill="#afbc9d"/><path d="M0 30 180 15" stroke="${colors.paint}" stroke-dasharray="6 5" stroke-width="1"/><path d="M0 20 180 5M0 43 180 28" stroke="#c9d6bb" stroke-width="1.5"/>${end}`;
  if (type === "rail")
    return `${begin}<path d="M-5 49 185 20" stroke="#668369" stroke-width="20"/><path d="M10 31v25M40 27v25M70 22v25M100 17v25M130 12v25M160 8v25" stroke="#a6b7a0" stroke-width="2.6"/><path d="M0 31 180 3v13L0 44Z" fill="#c3ceba"/><path d="M0 37 180 9" stroke="#82977e" stroke-width="1.5"/>${end}`;
  return `${begin}<path d="M-5 53 185 22" stroke="#7c9370" stroke-width="22"/><path d="M-5 41 185 10" stroke="#b7c5a7" stroke-width="4"/><path d="m69 31 31-5 3 14-31 5Z" fill="#3b5741" stroke="#b2c6a7"/><path d="m75 31 3 12m4-13 3 12m4-13 3 12m4-13 3 12" stroke="#97b18a" stroke-width="1.5"/><path d="M15 42 57 36M115 26l45-8" stroke="#a4c5c3" stroke-width="1" stroke-dasharray="3 3"/>${end}`;
}
export function jointSketch(radius: number): string {
  const r = Math.min(18, Math.max(4, radius * 1.3));
  return `<svg class="junction-sketch" viewBox="0 0 84 74" fill="none"><path d="M0 25H${26 - r}Q26 25 26 ${25 - r}V0H58V${25 - r}Q58 25 ${58 + r} 25H84V49H${58 + r}Q58 49 58 ${49 + r}V74H26V${49 + r}Q26 49 ${26 - r} 49H0Z" fill="#809b7740" stroke="currentColor" stroke-width=".8"/><path d="M42 0v14m0 46v14M0 37h15m54 0h15" stroke="currentColor" opacity=".45" stroke-dasharray="3 3"/><circle cx="42" cy="37" r="3" fill="currentColor"/><path d="M${26 - r} 25H26v${-r}" stroke="#d1eac7" stroke-width=".65" stroke-dasharray="2 2"/><text x="12" y="16" font-size="7" fill="currentColor" font-family="monospace">R</text></svg>`;
}
