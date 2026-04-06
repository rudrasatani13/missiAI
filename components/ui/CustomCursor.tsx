"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function CustomCursor() {
  const [cursorEnabled, setCursorEnabled] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  useEffect(() => {
    // Only enable custom cursor on non-touch devices
    if (window.matchMedia("(pointer: fine)").matches) {
      setCursorEnabled(true);
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - 16);
      mouseY.set(e.clientY - 16);

      // elementFromPoint skips the cursor div (pointer-events-none) and
      // returns the real element under the cursor — no bubbling flicker.
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el) {
        setIsHovering(false);
        return;
      }
      const clickable =
        el.tagName.toLowerCase() === "a" ||
        el.tagName.toLowerCase() === "button" ||
        el.closest("a") !== null ||
        el.closest("button") !== null ||
        el.classList.contains("interactive") ||
        el.closest(".interactive") !== null;
      setIsHovering(clickable);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [mouseX, mouseY]);

  if (!cursorEnabled) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        * {
          cursor: none !important;
        }
        a, button, [role="button"], .interactive {
          cursor: pointer !important;
        }
        a *, button *, [role="button"] *, .interactive * {
          cursor: inherit !important;
        }
      `}} />
      {!isHovering && (
        <motion.div
          className="fixed top-0 left-0 w-8 h-8 rounded-full pointer-events-none z-[9999]"
          style={{
            x: cursorX,
            y: cursorY,
            backgroundColor: "#ffffff",
            mixBlendMode: "difference",
          }}
        />
      )}
    </>
  );
}
