import React, { useEffect, useState } from "react";
import { RenderAnalyticalThumbnailDataUrl } from "./ModelThumbnailRenderer.js";

export function AnalyticalShapeThumbnail({
  Shape = "cone",
  Scale = null,
  Material = null,
  Size = 48,
  ClassName = "",
  Style = undefined,
}) {
  const [Src, SetSrc] = useState(() =>
    RenderAnalyticalThumbnailDataUrl({
      Shape,
      Scale,
      Material,
      Size: Math.max(56, Size * 2),
    }),
  );

  useEffect(() => {
    const Next = RenderAnalyticalThumbnailDataUrl({
      Shape,
      Scale,
      Material,
      Size: Math.max(56, Size * 2),
    });
    if (Next !== Src) SetSrc(Next);
  }, [Shape, Size, Scale, Material]);

  if (!Src) {
    return (
      <span
        className={"analytical-thumb-fallback " + ClassName}
        data-thumb-shape={Shape}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: Size,
          height: Size,
          borderRadius: 8,
          background: "#181a1f",
          color: "#d4d4d0",
          fontSize: Math.max(9, Math.round(Size * 0.28)),
          ...Style,
        }}
      >
        3D
      </span>
    );
  }

  return (
    <img
      src={Src}
      alt=""
      width={Size}
      height={Size}
      draggable={false}
      data-thumb-shape={Shape}
      className={"analytical-thumb-img " + ClassName}
      style={{
        width: Size,
        height: Size,
        objectFit: "cover",
        borderRadius: Math.max(5, Math.round(Size * 0.16)),
        display: "block",
        pointerEvents: "none",
        ...Style,
      }}
    />
  );
}
