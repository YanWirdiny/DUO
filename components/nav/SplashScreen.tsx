"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** Brief branded intro shown once when the app shell first mounts: the logo
 * sits centered for a beat, then the whole panel lifts off-screen like a
 * curtain rising to reveal the page underneath (which is already rendered,
 * just covered). Persists across client-side nav within the (app) layout
 * since AppShell only mounts once per hard load. */
export function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 750);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small static local icon, not worth next/image's overhead */}
            <img
              src="/icons/logoGym.png"
              alt="Duo"
              className="h-20 w-20 rounded-3xl object-cover shadow-[var(--shadow-raised)]"
            />
            <span className="text-lg font-semibold tracking-tight text-text">Duo</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
