//==========================================================================================================================================
//                                                      LEVELDIALOGMODAL.JSX
//==========================================================================================================================================
// Modal dialogue box triggered from the Viewport Footer Level Dropdown / "+ Create Level" button.

import React, { useEffect, useRef, useState } from "react";
import { LEVEL_TEMPLATES } from "./LevelSystem.js";

export default function LevelDialogModal({
  Open,
  LevelCount = 3,
  ActiveLevelName = "Cornell-Studio Gallery",
  OnCancel,
  OnCreate,
}) {
  const [Name, SetName] = useState("");
  const [TemplateId, SetTemplateId] = useState("empty");
  const [Notes, SetNotes] = useState("");
  const InputRef = useRef(null);

  useEffect(() => {
    if (!Open) return;
    SetName(`Level ${String(LevelCount + 1).padStart(2, "0")} — New World`);
    SetTemplateId("empty");
    SetNotes("");
    const Timer = setTimeout(() => {
      InputRef.current?.focus();
      InputRef.current?.select();
    }, 20);
    return () => clearTimeout(Timer);
  }, [Open, LevelCount]);

  useEffect(() => {
    if (!Open) return;
    const OnKey = (Event) => {
      if (Event.key === "Escape") {
        Event.stopPropagation();
        OnCancel?.();
      }
    };
    window.addEventListener("keydown", OnKey);
    return () => window.removeEventListener("keydown", OnKey);
  }, [Open, OnCancel]);

  if (!Open) return null;

  const Submit = (Event) => {
    Event.preventDefault();
    OnCreate?.({
      Name: Name.trim() || `Level ${LevelCount + 1}`,
      TemplateId,
      Notes: Notes.trim(),
    });
  };

  return (
    <div
      className="level-modal-backdrop"
      role="presentation"
      onPointerDown={(Event) => {
        if (Event.target === Event.currentTarget) OnCancel?.();
      }}
    >
      <div
        className="level-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create Level"
      >
        <header className="level-modal-header">
          <div>
            <span className="level-modal-kicker">WORLD LEVEL AUTHORING</span>
            <h2>Create New Level</h2>
          </div>
          <button
            type="button"
            className="level-modal-close"
            aria-label="Close Create Level dialog"
            onClick={OnCancel}
          >
            ✕
          </button>
        </header>

        <form className="level-modal-body" onSubmit={Submit}>
          <label className="level-modal-field">
            <span>Level Name</span>
            <input
              ref={InputRef}
              type="text"
              maxLength={64}
              required
              aria-label="Level Name"
              value={Name}
              onChange={(Event) => SetName(Event.target.value)}
              placeholder="e.g. Exterior Courtyard Blockout"
            />
          </label>

          <div className="level-modal-field">
            <span>Starting Template</span>
            <div className="level-template-grid" role="radiogroup" aria-label="Starting Template">
              {LEVEL_TEMPLATES.map((Item) => {
                const Selected = TemplateId === Item.Id;
                return (
                  <button
                    key={Item.Id}
                    type="button"
                    role="radio"
                    aria-checked={Selected}
                    className={"level-template-card" + (Selected ? " selected" : "")}
                    onClick={() => SetTemplateId(Item.Id)}
                  >
                    <strong>{Item.Title}</strong>
                    <small>
                      {Item.Id === "duplicate"
                        ? `Clone "${ActiveLevelName}"`
                        : Item.Subtitle}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="level-modal-field">
            <span>Level Notes (optional)</span>
            <input
              type="text"
              maxLength={140}
              aria-label="Level Notes"
              value={Notes}
              onChange={(Event) => SetNotes(Event.target.value)}
              placeholder="Lighting mood, architectural scale, or benchmark goal…"
            />
          </label>

          <footer className="level-modal-actions">
            <button
              type="button"
              className="level-modal-btn secondary"
              onClick={OnCancel}
            >
              Cancel
            </button>
            <button type="submit" className="level-modal-btn primary">
              Create &amp; Open Level
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
