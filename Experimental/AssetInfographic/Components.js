// Global UI components: floating tooltip, toasts (with undo), command palette, count-up numbers.

import { Query, Escape } from "./Kit.js";

// Any element with data-tip="..." gets a pointer-following tooltip. Lines split on "\n";
// the first line is rendered bold.
export function InstallFloatTip() {
    const Tip = document.createElement("div");
    Tip.className = "FloatTip";
    Tip.hidden = true;
    document.body.append(Tip);
    let Current = null;
    const Place = (Event) => {
        const Pad = 14, Rect = Tip.getBoundingClientRect();
        let X = Event.clientX + Pad, Y = Event.clientY + Pad;
        if (X + Rect.width > innerWidth - 8) X = Event.clientX - Rect.width - Pad;
        if (Y + Rect.height > innerHeight - 8) Y = Event.clientY - Rect.height - Pad;
        Tip.style.transform = `translate(${Math.max(8, X)}px, ${Math.max(8, Y)}px)`;
    };
    document.addEventListener("pointerover", (Event) => {
        const Target = Event.target.closest?.("[data-tip]");
        if (Target === Current) return;
        Current = Target;
        if (!Target) { Tip.hidden = true; return; }
        const [Head, ...Rest] = Target.dataset.tip.split("\n");
        Tip.innerHTML = `<b>${Escape(Head)}</b>${Rest.map((Line) => `<span>${Escape(Line)}</span>`).join("")}`;
        Tip.hidden = false;
        Place(Event);
    });
    document.addEventListener("pointermove", (Event) => { if (Current) Place(Event); });
    document.addEventListener("pointerdown", () => { Tip.hidden = true; Current = null; });
    document.addEventListener("scroll", () => { Tip.hidden = true; Current = null; }, true);
}

export class Toasts {
    constructor(Host) { this.Host = Host; }

    Show(Message, { Action = null, Tone = "info", Duration = 4800 } = {}) {
        const Toast = document.createElement("div");
        Toast.className = `Toast Tone-${Tone}`;
        Toast.setAttribute("role", "status");
        Toast.innerHTML = `<i></i><span>${Escape(Message)}</span>${Action ? `<button>${Escape(Action.Label)}</button>` : ""}<div class="ToastClock" style="animation-duration:${Duration}ms"></div>`;
        const Dismiss = () => { Toast.classList.add("Leaving"); setTimeout(() => Toast.remove(), 260); };
        if (Action) Toast.querySelector("button").addEventListener("click", () => { Action.Run(); Dismiss(); });
        this.Host.append(Toast);
        while (this.Host.children.length > 4) this.Host.firstElementChild.remove();
        let Timer = setTimeout(Dismiss, Duration);
        Toast.addEventListener("pointerenter", () => { clearTimeout(Timer); Toast.classList.add("Held"); });
        Toast.addEventListener("pointerleave", () => { Toast.classList.remove("Held"); Timer = setTimeout(Dismiss, 1800); });
    }
}

// Ctrl/⌘+K palette: fuzzy-ish token match over sections, assets and actions supplied by the app.
export class CommandPalette {
    constructor(App) {
        this.App = App;
        this.Veil = Query("PaletteVeil");
        this.Input = Query("PaletteInput");
        this.List = Query("PaletteList");
        this.Active = 0;
        this.Matches = [];
        this.Input.addEventListener("input", () => { this.Active = 0; this.Refresh(); });
        this.Input.addEventListener("keydown", (Event) => {
            if (Event.key === "ArrowDown") { this.Active = Math.min(this.Matches.length - 1, this.Active + 1); this.Highlight(); Event.preventDefault(); }
            else if (Event.key === "ArrowUp") { this.Active = Math.max(0, this.Active - 1); this.Highlight(); Event.preventDefault(); }
            else if (Event.key === "Enter") { this.Run(this.Matches[this.Active]); Event.preventDefault(); }
            else if (Event.key === "Escape") { this.Close(); Event.preventDefault(); }
        });
        this.List.addEventListener("pointermove", (Event) => {
            const Row = Event.target.closest("[data-index]");
            if (Row && Number(Row.dataset.index) !== this.Active) { this.Active = Number(Row.dataset.index); this.Highlight(); }
        });
        this.List.addEventListener("click", (Event) => { const Row = Event.target.closest("[data-index]"); if (Row) this.Run(this.Matches[Number(Row.dataset.index)]); });
        this.Veil.addEventListener("pointerdown", (Event) => { if (Event.target === this.Veil) this.Close(); });
    }

    get IsOpen() { return !this.Veil.hidden; }

    Open(Prefill = "") {
        this.Veil.hidden = false;
        this.Input.value = Prefill;
        this.Active = 0;
        this.Refresh();
        this.Input.focus();
    }

    Close() { this.Veil.hidden = true; }

    Refresh() {
        const Tokens = this.Input.value.toLowerCase().split(/\s+/).filter(Boolean);
        const Commands = this.App.ConstructCommands();
        this.Matches = Commands.filter((Command) => {
            const Haystack = `${Command.Group} ${Command.Label} ${Command.Sub || ""}`.toLowerCase();
            return Tokens.every((Token) => Haystack.includes(Token));
        }).slice(0, 40);
        let LastGroup = null;
        this.List.innerHTML = this.Matches.map((Command, Index) => {
            const Heading = Command.Group !== LastGroup ? `<li class="PaletteGroup" aria-hidden="true">${Escape(Command.Group)}</li>` : "";
            LastGroup = Command.Group;
            return `${Heading}<li role="option" data-index="${Index}" aria-selected="${Index === this.Active}">${Command.Icon || ""}<span>${Escape(Command.Label)}${Command.Sub ? `<small>${Escape(Command.Sub)}</small>` : ""}</span>${Command.Keys ? `<kbd>${Escape(Command.Keys)}</kbd>` : ""}</li>`;
        }).join("") || `<li class="PaletteEmpty">Nothing matches “${Escape(this.Input.value)}”</li>`;
    }

    Highlight() {
        for (const Row of this.List.querySelectorAll("[data-index]")) {
            const On = Number(Row.dataset.index) === this.Active;
            Row.setAttribute("aria-selected", String(On));
            if (On) Row.scrollIntoView({ block: "nearest" });
        }
    }

    Run(Command) {
        if (!Command) return;
        this.Close();
        Command.Run();
    }
}

// Animate numbers inside elements marked data-count="<target>" (keeps any decimals / suffix in data-suffix).
export function AnimateCounts(Host) {
    const Reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const Element of Host.querySelectorAll("[data-count]")) {
        const Target = Number(Element.dataset.count), Decimals = Number(Element.dataset.decimals || 0), Suffix = Element.dataset.suffix || "";
        if (Reduced || !Number.isFinite(Target)) continue;
        const Start = performance.now(), Duration = 700;
        const Step = (Now) => {
            const T = Math.min(1, (Now - Start) / Duration), Eased = 1 - (1 - T) ** 3;
            Element.textContent = (Target * Eased).toFixed(Decimals) + Suffix;
            if (T < 1) requestAnimationFrame(Step);
        };
        requestAnimationFrame(Step);
    }
}
