"use client";

import { useEffect } from "react";

const interactiveSelector =
  'a[href], button:not(:disabled), select:not(:disabled), summary, input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled), [role="button"]:not([aria-disabled="true"])';

export default function CineFlowInteractionPlugin() {
  useEffect(() => {
    const makeRipple = (x: number, y: number) => {
      const ripple = document.createElement("span");
      ripple.className = "cf-interaction-ripple";
      ripple.setAttribute("aria-hidden", "true");
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      document.body.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 620);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(interactiveSelector);
      if (!target || target.matches(":disabled, [aria-disabled='true']")) return;
      if (target.closest("[data-no-ripple]")) return;
      const rect = target.getBoundingClientRect();
      makeRipple(
        event.clientX || rect.left + rect.width / 2,
        event.clientY || rect.top + rect.height / 2,
      );
    };

    const handleKeyboardClick = (event: MouseEvent) => {
      if (event.detail !== 0 || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(interactiveSelector);
      if (!target || target.matches(":disabled, [aria-disabled='true']")) return;
      const rect = target.getBoundingClientRect();
      makeRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);
    };

    const handleSelection = (event: Event) => {
      if (!(event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)) return;
      const target = event.target;
      if (!target.matches("select, input[type='checkbox'], input[type='radio']")) return;
      target.classList.remove("cf-selection-feedback");
      void target.offsetWidth;
      target.classList.add("cf-selection-feedback");
      window.setTimeout(() => target.classList.remove("cf-selection-feedback"), 700);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleKeyboardClick, true);
    document.addEventListener("change", handleSelection, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleKeyboardClick, true);
      document.removeEventListener("change", handleSelection, true);
      document.querySelectorAll(".cf-interaction-ripple").forEach((ripple) => ripple.remove());
    };
  }, []);

  return null;
}
