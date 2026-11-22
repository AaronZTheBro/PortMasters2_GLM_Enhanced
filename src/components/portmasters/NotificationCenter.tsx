"use client";

import { AnimatePresence, motion } from "framer-motion";
import { NotificationToast } from "./NotificationToast";
import type { NotificationItem } from "@/lib/use-notifications";

/** Shows one ambient notice while the complete list remains available. */
export function NotificationCenter({
  current,
  dismiss,
}: {
  current: NotificationItem | null;
  dismiss: () => void;
}) {
  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40 w-[min(360px,calc(100vw-2rem))]">
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <NotificationToast
              icon={current.icon}
              title={current.title}
              lines={current.lines}
              onActivate={current.onActivate}
              toastId={current.id}
              dismiss={dismiss}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
