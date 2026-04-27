"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { usePathname } from "next/navigation";

export function CustomCursor() {
  const pathname = usePathname();
  const [cursorEnabled, setCursorEnabled] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  useEffect(() => {
    if (pathname === "/") {
      setCursorEnabled(false);
      setIsHovering(false);
      document.body.classList.remove("custom-cursor-active");
      return;
    }

    // Only enable custom cursor on non-touch devices
    if (window.matchMedia("(pointer: fine)").matches) {
      setCursorEnabled(true);
      document.body.classList.add("custom-cursor-active");
    } else {
      setCursorEnabled(false);
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
      document.body.classList.remove("custom-cursor-active");
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [mouseX, mouseY, pathname]);

  if (!cursorEnabled) return null;

  return (
    <>
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
