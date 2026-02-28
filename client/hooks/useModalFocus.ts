import { RefObject, useEffect, useRef } from "react";
import { Platform } from "react-native";

const FOCUSABLE_SELECTOR = [
  "button",
  "[href]",
  "input",
  "select",
  "textarea",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalFocus(containerRef: RefObject<unknown>, isOpen: boolean) {
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    if (isOpen) {
      lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const frame = requestAnimationFrame(() => {
        const node = containerRef.current as { querySelector?: (selector: string) => Element | null } | null;
        const focusable = node?.querySelector?.(FOCUSABLE_SELECTOR);
        if (focusable instanceof HTMLElement) {
          focusable.focus();
        }
      });

      return () => {
        cancelAnimationFrame(frame);
      };
    }

    const previousFocused = lastFocusedRef.current;
    if (previousFocused) {
      const frame = requestAnimationFrame(() => {
        previousFocused.focus();
      });
      return () => {
        cancelAnimationFrame(frame);
      };
    }
  }, [containerRef, isOpen]);
}
