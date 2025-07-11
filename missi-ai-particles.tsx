"use client"

import { useRef, useEffect, useState } from "react"

export default function Component() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mousePositionRef = useRef({ x: 0, y: 0 })
  const isTouchingRef = useRef(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const bgImage = new Image();
    bgImage.src = '/galaxy-bg.jpg';

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      setIsMobile(window.innerWidth < 768)
    }

    updateCanvasSize()

    let particles: any[] = []
    let stars: any[] = []
    let shootingStars: any[] = []
    let textImageData: ImageData | null = null

    function createStars() {
      stars = []
      const starCount = isMobile ? 150 : 300
      for (let i = 0; i < starCount; i++) {
        // @ts-ignore
          // @ts-ignore
          // @ts-ignore
          stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 0.5,
          brightness: Math.random() * 0.7 + 0.3,
          twinkleSpeed: Math.random() * 0.02 + 0.01,
          twinkleOffset: Math.random() * Math.PI * 2,
        })
      }
    }

    function createShootingStar() {
        const side = Math.floor(Math.random() * 4);
        let startX, startY, endX, endY;
        switch (side) {
            case 0: // @ts-ignore
                startX = Math.random() * canvas.width; startY = -50; endX = Math.random() * canvas.width; endY = canvas.height + 50; break;
            case 1: // @ts-ignore
                startX = canvas.width + 50; // @ts-ignore
                startY = Math.random() * canvas.height; endX = -50; endY = Math.random() * canvas.height; break;
            case 2: // @ts-ignore
                startX = Math.random() * canvas.width; // @ts-ignore
                startY = canvas.height + 50; endX = Math.random() * canvas.width; endY = -50; break;
            default: startX = -50; // @ts-ignore
                startY = Math.random() * canvas.height; endX = canvas.width + 50; endY = Math.random() * canvas.height;
        }
        const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
        const speed = 10 + Math.random() * 5;
        return {
            x: startX,
            y: startY,
            vx: ((endX - startX) / distance) * speed,
            vy: ((endY - startY) / distance) * speed,
            length: 50 + Math.random() * 70,
            brightness: 0.9 + Math.random() * 0.2,
            life: 120 + Math.random() * 60,
            maxLife: 120 + Math.random() * 60
        };
    }

    function createTextImage() {
      if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) return 0
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.save();

      // *** YAHAN CHANGE KIYA GAYA HAI ***
      // Mobile ke liye font size 48 se badha kar 64 kar diya hai
      const fontSize = isMobile ? 64 : 96;

      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const missiText = "missi";
      const aiText = "AI";
      const missiMetrics = ctx.measureText(missiText);
      const aiMetrics = ctx.measureText(aiText);
      const spacing = fontSize * 0.3;
      const totalWidth = missiMetrics.width + spacing + aiMetrics.width;
      const startX = centerX - totalWidth / 2;
      const textY = centerY;
      ctx.fillText(missiText, startX + missiMetrics.width / 2, textY);
      ctx.fillText(aiText, startX + missiMetrics.width + spacing + aiMetrics.width / 2, textY);
      ctx.restore();
      if (canvas.width > 0 && canvas.height > 0) {
        textImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return fontSize / 96;
    }

    function createParticle(scale: number) {
      if (!ctx || !canvas || !textImageData) return null;
      const data = textImageData.data;
      for (let attempt = 0; attempt < 100; attempt++) {
        const x = Math.floor(Math.random() * canvas.width);
        const y = Math.floor(Math.random() * canvas.height);
        if (data[(y * canvas.width + x) * 4 + 3] > 128) {
          const missiEndX = canvas.width / 2;
          const isMissi = x <= missiEndX;
          return { x, y, baseX: x, baseY: y, size: Math.random() * 1.5 + 0.5, color: "white", scatteredColor: isMissi ? "#00DCFF" : "#FF6B6B", isMissi };
        }
      }
      return null;
    }

    function createInitialParticles(scale: number) {
        if (!textImageData) return;
        const baseParticleCount = 8000;
        // @ts-ignore
        const particleCount = Math.floor(baseParticleCount * Math.sqrt((canvas.width * canvas.height) / (1920 * 1080)));
        for (let i = 0; i < particleCount; i++) {
            const particle = createParticle(scale);
            if (particle) particles.push(particle);
        }
    }

    function drawBackgroundImageCover() {
        if (!ctx || !canvas || !bgImage.complete || bgImage.naturalWidth === 0) {
            return;
        }
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const imageAspectRatio = bgImage.naturalWidth / bgImage.naturalHeight;
        const canvasAspectRatio = canvasWidth / canvasHeight;
        let renderWidth, renderHeight, xStart, yStart;
        if (canvasAspectRatio > imageAspectRatio) {
            renderWidth = canvasWidth;
            renderHeight = canvasWidth / imageAspectRatio;
            xStart = 0;
            yStart = (canvasHeight - renderHeight) / 2;
        } else {
            renderHeight = canvasHeight;
            renderWidth = canvasHeight * imageAspectRatio;
            yStart = 0;
            xStart = (canvasWidth - renderWidth) / 2;
        }
        ctx.drawImage(bgImage, xStart, yStart, renderWidth, renderHeight);
    }

    let animationFrameId: number;
    let time = 0;
    let lastShootingStarTime = 0;

    function animate(scale: number) {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawBackgroundImageCover();

      time += 0.016;
      const { x: mouseX, y: mouseY } = mousePositionRef.current;

      stars.forEach(star => {
          const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.5 + 0.5;
          const alpha = star.brightness * twinkle;
          const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 3);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
      });

      if (time - lastShootingStarTime > 5 + Math.random() * 5) {
          shootingStars.push(createShootingStar());
          lastShootingStarTime = time;
      }

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (s.life <= 0) {
            shootingStars.splice(i, 1);
        } else {
            const alpha = (s.life / s.maxLife) * s.brightness;
            const trailLength = Math.min(s.length, s.maxLife - s.life);
            const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * trailLength, s.y - s.vy * trailLength);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * trailLength, s.y - s.vy * trailLength);
            ctx.stroke();
        }
      }

      particles.forEach((p) => {
          const dx = mouseX - p.x;
          const dy = mouseY - p.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const maxDistance = 240;
          if (distance < maxDistance && (isTouchingRef.current || !("ontouchstart" in window))) {
            const force = (maxDistance - distance) / maxDistance;
            const angle = Math.atan2(dy, dx);
            p.x = p.baseX - Math.cos(angle) * force * 60;
            p.y = p.baseY - Math.sin(angle) * force * 60;
            ctx.fillStyle = p.scatteredColor;
          } else {
            p.x += (p.baseX - p.x) * 0.1;
            p.y += (p.baseY - p.y) * 0.1;
            ctx.fillStyle = "white";
          }
          ctx.fillRect(p.x, p.y, p.size, p.size);
      });

      animationFrameId = requestAnimationFrame(() => animate(scale));
    }

    const initializeEffect = () => {
        if (canvas.width === 0 || canvas.height === 0) {
            setTimeout(initializeEffect, 100);
            return;
        }
        const scale = createTextImage();
        createStars();
        if (textImageData) {
            createInitialParticles(scale);

            const startAnimation = () => {
                if (bgImage.complete) {
                    animate(scale);
                } else {
                    bgImage.onload = () => {
                        animate(scale);
                    }
                }
            }
            startAnimation();
        }
    }

    initializeEffect();

    const handleResize = () => {
        updateCanvasSize();
        setTimeout(() => {
            if (canvas.width > 0 && canvas.height > 0) {
                const newScale = createTextImage();
                createStars();
                particles = [];
                shootingStars = [];
                if (textImageData) createInitialParticles(newScale);
            }
        }, 100);
    }

    const handleMove = (x: number, y: number) => { mousePositionRef.current = { x, y } }
    const handleMouseMove = (e: MouseEvent) => { handleMove(e.clientX, e.clientY) }
    const handleTouchMove = (e: TouchEvent) => { if (e.touches.length > 0) { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY) } }
    const handleTouchStart = () => { isTouchingRef.current = true }
    const handleTouchEnd = () => { isTouchingRef.current = false; mousePositionRef.current = { x: 0, y: 0 } }
    const handleMouseLeave = () => { if (!("ontouchstart" in window)) mousePositionRef.current = { x: 0, y: 0 } }

    window.addEventListener("resize", handleResize);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouchStart);
    canvas.addEventListener("touchend", handleTouchEnd);

    return () => {
        window.removeEventListener("resize", handleResize);
        canvas.removeEventListener("mousemove", handleMouseMove);
        canvas.removeEventListener("touchmove", handleTouchMove);
        canvas.removeEventListener("mouseleave", handleMouseLeave);
        canvas.removeEventListener("touchstart", handleTouchStart);
        canvas.removeEventListener("touchend", handleTouchEnd);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }
  }, [isMobile])

  return (
    <div className="relative w-full h-dvh flex flex-col items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full absolute top-0 left-0 touch-none"
        aria-label="Interactive particle effect with missiAI logo and starry background"
      />

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-16 sm:mt-20 md:mt-24 z-10">
        <p className="text-gray-400 text-lg sm:text-xl md:text-2xl font-light tracking-wider">Coming Soon</p>
      </div>

      <div className="absolute bottom-[100px] text-center z-10">
        <p className="font-mono text-gray-400 text-xs sm:text-base md:text-sm">
          Powered by <span className="text-gray-300 hover:text-cyan-400 transition-colors duration-300">missiAI</span> -
          Next Generation AI Platform
        </p>
      </div>
    </div>
  )
}