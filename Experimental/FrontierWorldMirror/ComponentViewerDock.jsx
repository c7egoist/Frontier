//==========================================================================================================================================
//                                                    COMPONENTVIEWERDOCK.JSX
//==========================================================================================================================================
// Experimental/ComponentViewer hosted as a dockable "ComponentViewer" tab inside the World Mirror editor. One persistent
// iframe lives at workspace level and is laid over whichever dock slot currently shows the tab, so blueprints, the
// camera and the simulate state survive tab switches and drags between docks (React would otherwise remount it).

import React, { useEffect, useRef, useState } from "react";

export const COMPONENT_VIEWER_TAB = "ComponentViewer";

// Resolves from both "/" (Serve.py editor root, mapped to Experimental/) and "/Experimental/FrontierWorldMirror/"
const COMPONENT_VIEWER_SRC = "../ComponentViewer/index.html?host=world-mirror";

const SlotRegistry = { Element: null, Listeners: new Set() };

function PublishSlot(Element) {
  if (SlotRegistry.Element === Element) return;
  SlotRegistry.Element = Element;
  for (const Listener of SlotRegistry.Listeners) Listener(Element);
}

// Placeholder rendered by PanelBody where the tab is active; the shared iframe tracks its rectangle
export function ComponentViewerSlot() {
  const SlotRef = useRef(null);
  useEffect(() => {
    PublishSlot(SlotRef.current);
    return () => {
      if (SlotRegistry.Element === SlotRef.current) PublishSlot(null);
    };
  }, []);
  return (
    <div className="component-viewer-slot" ref={SlotRef} aria-label="ComponentViewer dock">
      <span>Loading ComponentViewer…</span>
    </div>
  );
}

// Workspace-level host. Mounted while the tab exists in any dock; hidden while no slot is on screen.
export function ComponentViewerHost({ Open }) {
  const FrameRef = useRef(null);
  const [Slot, SetSlot] = useState(SlotRegistry.Element);

  useEffect(() => {
    const Listener = (Element) => SetSlot(Element);
    SlotRegistry.Listeners.add(Listener);
    SetSlot(SlotRegistry.Element);
    return () => SlotRegistry.Listeners.delete(Listener);
  }, []);

  useEffect(() => {
    const Frame = FrameRef.current;
    if (!Frame) return undefined;
    if (!Slot) {
      Frame.style.visibility = "hidden";
      return undefined;
    }
    let Handle = 0;
    let Last = "";
    const Track = () => {
      const Rect = Slot.getBoundingClientRect();
      const Key = `${Rect.left}|${Rect.top}|${Rect.width}|${Rect.height}`;
      if (Key !== Last) {
        Last = Key;
        Frame.style.left = Rect.left + "px";
        Frame.style.top = Rect.top + "px";
        Frame.style.width = Math.max(0, Rect.width) + "px";
        Frame.style.height = Math.max(0, Rect.height) + "px";
        Frame.style.visibility = Rect.width > 2 && Rect.height > 2 ? "visible" : "hidden";
      }
      Handle = requestAnimationFrame(Track);
    };
    Track();
    return () => cancelAnimationFrame(Handle);
  }, [Slot]);

  if (!Open) return null;
  return (
    <iframe
      ref={FrameRef}
      className="component-viewer-frame"
      title="ComponentViewer"
      src={COMPONENT_VIEWER_SRC}
      style={{ visibility: "hidden" }}
    />
  );
}
