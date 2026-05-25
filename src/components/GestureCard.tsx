import React, { useRef, useState, useEffect } from "react";

interface GestureCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onClick?: () => void;
  className?: string;
  swipeThreshold?: number;
  key?: React.Key;
}

export default function GestureCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  onClick,
  className = "",
  swipeThreshold = 80,
}: GestureCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragX = useRef(0);
  const startX = useRef(0);
  const isDragging = useRef(false);
  const animFrameId = useRef<number | null>(null);

  const [isSwipedRight, setIsSwipedRight] = useState(false);
  const [isSwipedLeft, setIsSwipedLeft] = useState(false);
  const [activeDrag, setActiveDrag] = useState(false);

  // Clean anim on unmount
  useEffect(() => {
    return () => {
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Avoid capturing right-clicks or multi-touch interference
    if (e.button !== 0) return;
    
    // Set pointer capture to lock mouse or touch to this element
    cardRef.current?.setPointerCapture(e.pointerId);
    
    startX.current = e.clientX;
    isDragging.current = true;
    dragX.current = 0;
    setActiveDrag(true);

    if (cardRef.current) {
      cardRef.current.style.transition = "none";
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;

    const currentX = e.clientX;
    const diff = currentX - startX.current;
    
    // Reduce resistance if dragged too far
    dragX.current = diff;

    // Use requestAnimationFrame for fluid smooth render and to bypass react reconciler latency
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
    }

    animFrameId.current = requestAnimationFrame(() => {
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${dragX.current}px) scale(${activeDrag ? 0.99 : 1})`;
      }
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    
    cardRef.current?.releasePointerCapture(e.pointerId);
    isDragging.current = false;
    setActiveDrag(false);

    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
    }

    // Apply smooth recovery spring animation
    if (cardRef.current) {
      cardRef.current.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    }

    const finalDrag = dragX.current;

    // Check threshold directions
    if (finalDrag > swipeThreshold) {
      // Swiped Right
      if (onSwipeRight) {
        onSwipeRight();
      }
      setIsSwipedRight(true);
      setTimeout(() => setIsSwipedRight(false), 1500);
    } else if (finalDrag < -swipeThreshold) {
      // Swiped Left
      if (onSwipeLeft) {
        onSwipeLeft();
      }
      setIsSwipedLeft(true);
      setTimeout(() => setIsSwipedLeft(false), 1500);
    }

    // Return element to original neutral layout smoothly
    if (cardRef.current) {
      cardRef.current.style.transform = "translateX(0px) scale(1)";
    }

    // Fire generic click event if there was no substantial swipe displacement
    if (Math.abs(finalDrag) < 8 && onClick) {
      onClick();
    }
    
    dragX.current = 0;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setActiveDrag(false);

    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
    }

    if (cardRef.current) {
      cardRef.current.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
      cardRef.current.style.transform = "translateX(0px) scale(1)";
    }
    dragX.current = 0;
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl select-none">
      {/* Visual Feedback Badges behind swipe directions */}
      <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none text-white text-[10px] font-bold rounded-2xl">
        <div className="bg-blue-600/90 text-white px-2.5 py-1.5 rounded-full backdrop-blur-md opacity-25">
          👉 בחירה / התמקדות
        </div>
        <div className="bg-amber-600/90 text-white px-2.5 py-1.5 rounded-full backdrop-blur-md opacity-25">
          שליחת עדכון 👈
        </div>
      </div>

      <div
        id="gesture-card-container"
        ref={cardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: "none" }} // responsive guard preventing vertical page scrolling interference
        className={`relative z-10 transition-transform cursor-grab active:cursor-grabbing ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
