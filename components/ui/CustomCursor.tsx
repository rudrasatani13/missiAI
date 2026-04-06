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

    const moveCursor = (e: MouseEvent) => {
      mouseX.set(e.clientX - 16);
      mouseY.set(e.clientY - 16);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName.toLowerCase() === "a" ||
        target.tagName.toLowerCase() === "button" ||
        target.closest("a") ||
        target.closest("button") ||
        target.classList.contains("interactive")
      ) {
        setIsHovering(true);
      } else {
        setIsHovering(false);
      }
    };

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mouseover", handleMouseOver);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mouseover", handleMouseOver);
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
