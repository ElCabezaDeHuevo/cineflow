"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export default function ScreenshotLightbox({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ampliar captura: ${alt}`}
        className="block w-full cursor-zoom-in"
      >
        <Image
          src={src}
          alt={alt}
          width={960}
          height={540}
          unoptimized
          className="h-44 w-full object-cover"
        />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              className="relative max-h-[92vh] max-w-[95vw]"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar captura ampliada"
                className="absolute -right-3 -top-3 z-10 rounded-full border border-white/20 bg-[#171821] px-3 py-1 text-lg text-white shadow-lg"
              >
                ×
              </button>
              <Image
                src={src}
                alt={alt}
                width={1920}
                height={1080}
                unoptimized
                className="max-h-[92vh] max-w-[95vw] rounded-xl object-contain"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
