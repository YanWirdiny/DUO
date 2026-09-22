"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import { cn } from "@/lib/utils";

/** Tweens the displayed number from its previous value to `value` whenever it changes. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);

  useEffect(() => {
    // Mutate textContent directly (bypassing React re-render) so the animation runs at 60fps.
    const node = ref.current;
    if (!node) return;
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        node.textContent = Math.round(v).toLocaleString();
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value.toLocaleString()}
    </span>
  );
}
