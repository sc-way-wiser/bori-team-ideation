// components/ui/BottomSheet.jsx - Reusable iOS-style bottom sheet
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { cn } from "../../utils/cn";
import useBrowser from "../../hooks/useBrowserDetect.jsx";
import { CaretLeftIcon } from "@phosphor-icons/react";

const BottomSheet = ({
  isOpen,
  onClose,
  onRequestClose,
  onAnimationComplete,
  onDragStart,
  onDragEnd,
  children,
  title,
  titleSize = "text-lg",
  titleAlign,
  headerBackButton = false,
  description,
  showHandle = true,
  showHeader = false,
  maxHeight = "55vh",
  minHeight = "35vh",
  maxWidth = "max-w-[800px]",
  className,
  backdropClassName,
  contentClassName,
  onCancel,
  onConfirm,
  cancelText = "Cancel",
  confirmText = "Done",
  hideActions = false,
  customActionButton,
  backdrop = true,
  zIndex = "z-[9999]",
  usePortal = true,
  borderRadius = "rounded-t-3xl",
  disableDragToClose = false,
}) => {
  const browserInfo = useBrowser();
  void browserInfo; // consumed for side-effect of --vh via BrowserProvider
  const shouldShowBackdrop = backdrop;

  const sheetRef = React.useRef(null);
  const sheetContentRef = React.useRef(null);
  const [dragStartY, setDragStartY] = React.useState(0);
  const [dragStartX, setDragStartX] = React.useState(0);
  const [dragCurrentY, setDragCurrentY] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [scrollDirection, setScrollDirection] = React.useState(null);
  const [isClosing, setIsClosing] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const [viewportHeight, setViewportHeight] = React.useState(
    typeof window !== "undefined" ? window.innerHeight : 0,
  );
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [adjustedMaxHeight, setAdjustedMaxHeight] = React.useState(null);
  const [keyboardActive, setKeyboardActive] = React.useState(false);
  const initialViewportHeight = React.useRef(
    typeof window !== "undefined" ? window.innerHeight : 0,
  );
  const prevIsOpenRef = React.useRef(isOpen);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsMounted(true), 10);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setIsMounted(false), 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    const isNowClosed = !isOpen;
    if (wasOpen && isNowClosed && !isClosing) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsClosing(true);
          setTimeout(() => {
            setIsClosing(false);
            if (onAnimationComplete) onAnimationComplete();
          }, 350);
        });
      });
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, isClosing, onAnimationComplete]);

  useEffect(() => {
    if (!isOpen) return;
    initialViewportHeight.current = window.innerHeight;

    const handleFocusIn = (e) => {
      const target = e.target;
      const sheetElement = sheetRef.current;
      if (!sheetElement || !sheetElement.contains(target)) return;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        setKeyboardHeight(1);
        setTimeout(() => {
          const newViewportHeight = window.innerHeight;
          const heightDifference =
            initialViewportHeight.current - newViewportHeight;
          if (heightDifference > 100) {
            setKeyboardActive(true);
            setAdjustedMaxHeight(`${newViewportHeight * 0.95}px`);
            setViewportHeight(newViewportHeight);
            setTimeout(() => {
              target.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
              });
            }, 100);
          }
        }, 400);
      }
    };

    const handleFocusOut = (e) => {
      const target = e.target;
      const sheetElement = sheetRef.current;
      if (!sheetElement || !sheetElement.contains(target)) return;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        setTimeout(() => {
          const newActive = document.activeElement;
          if (
            !newActive ||
            (!(newActive instanceof HTMLInputElement) &&
              !(newActive instanceof HTMLTextAreaElement) &&
              !(newActive instanceof HTMLSelectElement)) ||
            !sheetElement.contains(newActive)
          ) {
            setKeyboardHeight(0);
            setKeyboardActive(false);
            setAdjustedMaxHeight(null);
            setViewportHeight(initialViewportHeight.current);
          }
        }, 100);
      }
    };

    const handleResize = () => {
      if (keyboardHeight > 0) {
        const newHeight = window.innerHeight;
        const heightDiff = initialViewportHeight.current - newHeight;
        if (heightDiff > 100) {
          setKeyboardActive(true);
          setViewportHeight(newHeight);
          setAdjustedMaxHeight(`${newHeight * 0.95}px`);
        }
      }
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    window.addEventListener("resize", handleResize);
    return () => {
      setKeyboardHeight(0);
      setKeyboardActive(false);
      setAdjustedMaxHeight(null);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, keyboardHeight]);

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";

      const preventScroll = (e) => {
        const target = e.target;
        const sheetElement = sheetRef.current;
        const dragHandle = handleRef.current;
        if (!sheetElement) {
          e.preventDefault();
          return;
        }
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest("select")
        )
          return;
        if (
          dragHandle &&
          (dragHandle === target || dragHandle.contains(target))
        )
          return;
        const scrollableContent = sheetElement.querySelector(
          ".overflow-y-auto, .overflow-x-auto",
        );
        if (scrollableContent && scrollableContent.contains(target)) return;
        let element = target;
        while (element && element !== sheetElement) {
          const style = window.getComputedStyle(element);
          if (
            style.overflowX === "auto" ||
            style.overflowX === "scroll" ||
            style.overflowY === "auto" ||
            style.overflowY === "scroll" ||
            element.classList.contains("swiper") ||
            element.classList.contains("overflow-x-auto") ||
            element.classList.contains("overflow-y-auto")
          )
            return;
          element = element.parentElement;
        }
        e.preventDefault();
      };

      document.addEventListener("touchmove", preventScroll, {
        passive: false,
        capture: true,
      });
      document.addEventListener("wheel", preventScroll, { passive: false });

      return () => {
        const currentTop = document.body.style.top;
        const scrollY = currentTop
          ? parseInt(currentTop.replace("-", "").replace("px", ""))
          : 0;
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
        if (scrollY > 0) window.scrollTo(0, scrollY);
        document.removeEventListener("touchmove", preventScroll, {
          capture: true,
        });
        document.removeEventListener("wheel", preventScroll);
      };
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
    };
  }, [isOpen]);

  const handleClose = React.useCallback(
    (force = false) => {
      setIsClosing((prevIsClosing) => {
        if (prevIsClosing) return prevIsClosing;
        setTimeout(() => {
          setIsClosing(false);
          onClose?.();
        }, 350);
        return true;
      });
    },
    [onClose],
  );

  React.useEffect(() => {
    if (onRequestClose && isOpen) onRequestClose(handleClose);
  }, [onRequestClose, handleClose, isOpen]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape" && isOpen && !isClosing) handleClose(true);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, isClosing, handleClose]);

  const handleRef = React.useRef(null);
  const dragStateRef = React.useRef({
    startY: 0,
    startX: 0,
    currentY: 0,
    direction: null,
    isDragging: false,
  });

  useEffect(() => {
    const handleElement = handleRef.current;
    if (!handleElement) return;

    const isInput = (target) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("select") ||
      target.closest('button[type="button"]') ||
      target.closest('button[type="submit"]');

    const onTouchStart = (e) => {
      if (isInput(e.target)) return;
      e.stopPropagation();
      const startY = e.touches[0].clientY;
      const startX = e.touches[0].clientX;
      const sheetElement = sheetRef.current;
      const sheetRect = sheetElement?.getBoundingClientRect();
      const sheetMiddle = sheetRect
        ? sheetRect.top + sheetRect.height * 0.5
        : 0;
      const scrollableContent = sheetElement?.querySelector(
        ".overflow-y-auto, .overflow-auto",
      );
      dragStateRef.current = {
        startY,
        startX,
        currentY: 0,
        direction: null,
        isDragging: true,
        startedInUpperHalf: startY < sheetMiddle,
        isScrollAtTop: scrollableContent
          ? scrollableContent.scrollTop === 0
          : false,
        initialMoveThreshold: 5,
        hasDeterminedIntent: false,
      };
      setDragStartY(startY);
      setDragStartX(startX);
      setScrollDirection(null);
      setIsDragging(true);
      if (onDragStart) onDragStart();
    };

    const onMouseDown = (e) => {
      if (isInput(e.target)) return;
      e.stopPropagation();
      const startY = e.clientY;
      const startX = e.clientX;
      const sheetElement = sheetRef.current;
      const sheetRect = sheetElement?.getBoundingClientRect();
      const sheetMiddle = sheetRect
        ? sheetRect.top + sheetRect.height * 0.5
        : 0;
      const scrollableContent = sheetElement?.querySelector(
        ".overflow-y-auto, .overflow-auto",
      );
      dragStateRef.current = {
        startY,
        startX,
        currentY: 0,
        direction: null,
        isDragging: true,
        startedInUpperHalf: startY < sheetMiddle,
        isScrollAtTop: scrollableContent
          ? scrollableContent.scrollTop === 0
          : false,
        initialMoveThreshold: 5,
        hasDeterminedIntent: false,
      };
      setDragStartY(startY);
      setDragStartX(startX);
      setScrollDirection(null);
      setIsDragging(true);
      if (onDragStart) onDragStart();
    };

    const onTouchMove = (e) => {
      if (!dragStateRef.current.isDragging || isInput(e.target)) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - dragStateRef.current.startY;
      const deltaX = currentX - dragStateRef.current.startX;
      if (
        !dragStateRef.current.hasDeterminedIntent &&
        (Math.abs(deltaY) > dragStateRef.current.initialMoveThreshold ||
          Math.abs(deltaX) > dragStateRef.current.initialMoveThreshold)
      ) {
        dragStateRef.current.hasDeterminedIntent = true;
        if (deltaY < -5) {
          dragStateRef.current.direction = "scroll-down";
          dragStateRef.current.isDragging = false;
          setIsDragging(false);
          return;
        } else if (
          deltaY > 5 &&
          (dragStateRef.current.isScrollAtTop ||
            dragStateRef.current.startedInUpperHalf)
        ) {
          dragStateRef.current.direction = "drag-down";
        }
      }
      if (dragStateRef.current.direction === "scroll-down") return;
      if (
        !dragStateRef.current.direction &&
        (Math.abs(deltaY) > 15 || Math.abs(deltaX) > 15)
      ) {
        if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          dragStateRef.current.direction = "horizontal";
          setScrollDirection("horizontal");
        } else if (deltaY > Math.abs(deltaX) * 1.5) {
          dragStateRef.current.direction = "vertical";
          setScrollDirection("vertical");
        }
      }
      if (deltaY < 0) {
        dragStateRef.current.currentY = 0;
        setDragCurrentY(0);
        return;
      }
      const canDrag =
        dragStateRef.current.isScrollAtTop ||
        dragStateRef.current.startedInUpperHalf;
      if (
        (dragStateRef.current.direction === "vertical" ||
          dragStateRef.current.direction === "drag-down") &&
        deltaY > 0 &&
        canDrag
      ) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        dragStateRef.current.currentY = deltaY;
        setDragCurrentY(deltaY);
      } else if (
        !dragStateRef.current.direction &&
        canDrag &&
        deltaY > 0 &&
        Math.abs(deltaY) > Math.abs(deltaX)
      ) {
        dragStateRef.current.currentY = deltaY;
        setDragCurrentY(deltaY);
      } else {
        dragStateRef.current.currentY = 0;
        setDragCurrentY(0);
      }
    };

    const onTouchEnd = (e) => {
      if (!dragStateRef.current.isDragging || isInput(e.target)) return;
      const threshold =
        dragStateRef.current.isScrollAtTop ||
        dragStateRef.current.startedInUpperHalf
          ? 150
          : 300;
      const shouldClose =
        (dragStateRef.current.direction === "vertical" ||
          dragStateRef.current.direction === "drag-down") &&
        dragStateRef.current.currentY > threshold;
      if (
        (dragStateRef.current.direction === "vertical" ||
          dragStateRef.current.direction === "drag-down") &&
        dragStateRef.current.currentY > 5
      ) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }
      dragStateRef.current = {
        startY: 0,
        startX: 0,
        currentY: 0,
        direction: null,
        isDragging: false,
        startedInUpperHalf: false,
        isScrollAtTop: false,
      };
      setIsDragging(false);
      setDragStartY(0);
      setDragStartX(0);
      setDragCurrentY(0);
      setScrollDirection(null);
      if (onDragEnd) onDragEnd();
      if (shouldClose) handleClose(true);
    };

    handleElement.addEventListener("touchstart", onTouchStart, {
      passive: false,
      capture: true,
    });
    handleElement.addEventListener("touchmove", onTouchMove, {
      passive: false,
      capture: true,
    });
    handleElement.addEventListener("touchend", onTouchEnd, {
      passive: false,
      capture: true,
    });
    handleElement.addEventListener("mousedown", onMouseDown, { capture: true });

    return () => {
      handleElement.removeEventListener("touchstart", onTouchStart);
      handleElement.removeEventListener("touchmove", onTouchMove);
      handleElement.removeEventListener("touchend", onTouchEnd);
      handleElement.removeEventListener("mousedown", onMouseDown);
    };
  }, [showHandle, handleClose, onDragStart, onDragEnd]);

  useEffect(() => {
    const sheetElement = sheetContentRef.current;
    if (!sheetElement || disableDragToClose) return;

    const isInput = (target) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("select") ||
      target.closest('button[type="button"]') ||
      target.closest('button[type="submit"]');

    const onSheetTouchStart = (e) => {
      const target = e.target;
      if (isInput(target)) return;
      if (handleRef.current && handleRef.current.contains(target)) return;
      const startY = e.touches[0].clientY;
      const startX = e.touches[0].clientX;
      const sheetRect = sheetElement.getBoundingClientRect();
      const sheetMiddle = sheetRect.top + sheetRect.height * 0.5;
      let scrollableContent = null;
      let el = target;
      while (el && el !== sheetElement) {
        const style = window.getComputedStyle(el);
        if (
          style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          style.overflow === "auto" ||
          style.overflow === "scroll" ||
          el.classList.contains("overflow-y-auto") ||
          el.classList.contains("overflow-auto")
        ) {
          scrollableContent = el;
          break;
        }
        el = el.parentElement;
      }
      dragStateRef.current = {
        startY,
        startX,
        currentY: 0,
        direction: null,
        isDragging: true,
        startedInUpperHalf: startY < sheetMiddle,
        isScrollAtTop: scrollableContent
          ? scrollableContent.scrollTop <= 1
          : true,
        hasScrollableContent: scrollableContent
          ? scrollableContent.scrollHeight > scrollableContent.clientHeight
          : false,
        scrollableContent,
        initialMoveThreshold: 10,
        hasDeterminedIntent: false,
      };
      setDragStartY(startY);
      setDragStartX(startX);
      setScrollDirection(null);
      setIsDragging(true);
      if (onDragStart) onDragStart();
    };

    const onSheetTouchMove = (e) => {
      if (!dragStateRef.current.isDragging || isInput(e.target)) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - dragStateRef.current.startY;
      const deltaX = currentX - dragStateRef.current.startX;
      if (
        !dragStateRef.current.hasDeterminedIntent &&
        (Math.abs(deltaY) > dragStateRef.current.initialMoveThreshold ||
          Math.abs(deltaX) > dragStateRef.current.initialMoveThreshold)
      ) {
        dragStateRef.current.hasDeterminedIntent = true;
        const currentScrollTop =
          dragStateRef.current.scrollableContent?.scrollTop || 0;
        const isCurrentlyAtTop = currentScrollTop <= 1;
        if (deltaY < -10) {
          dragStateRef.current.direction = "scroll-up";
          dragStateRef.current.isDragging = false;
          setIsDragging(false);
          return;
        } else if (
          deltaY > 10 &&
          dragStateRef.current.hasScrollableContent &&
          !isCurrentlyAtTop &&
          !dragStateRef.current.startedInUpperHalf
        ) {
          dragStateRef.current.direction = "scroll-down";
          dragStateRef.current.isDragging = false;
          setIsDragging(false);
          return;
        } else if (
          deltaY > 10 &&
          (isCurrentlyAtTop || dragStateRef.current.startedInUpperHalf)
        ) {
          dragStateRef.current.direction = "drag-down";
        }
      }
      if (
        dragStateRef.current.direction === "scroll-up" ||
        dragStateRef.current.direction === "scroll-down"
      )
        return;
      if (deltaY < 0) {
        dragStateRef.current.currentY = 0;
        setDragCurrentY(0);
        return;
      }
      const canDrag =
        dragStateRef.current.isScrollAtTop ||
        dragStateRef.current.startedInUpperHalf;
      if (
        (dragStateRef.current.direction === "drag-down" ||
          !dragStateRef.current.direction) &&
        deltaY > 0 &&
        canDrag
      ) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        dragStateRef.current.currentY = deltaY;
        setDragCurrentY(deltaY);
      }
    };

    const onSheetTouchEnd = (e) => {
      if (!dragStateRef.current.isDragging || isInput(e.target)) return;
      const threshold =
        dragStateRef.current.isScrollAtTop ||
        dragStateRef.current.startedInUpperHalf
          ? 150
          : 300;
      const shouldClose =
        dragStateRef.current.direction === "drag-down" &&
        dragStateRef.current.currentY > threshold;
      if (
        dragStateRef.current.direction === "drag-down" &&
        dragStateRef.current.currentY > 5
      ) {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }
      dragStateRef.current = {
        startY: 0,
        startX: 0,
        currentY: 0,
        direction: null,
        isDragging: false,
        startedInUpperHalf: false,
        isScrollAtTop: false,
      };
      setIsDragging(false);
      setDragStartY(0);
      setDragStartX(0);
      setDragCurrentY(0);
      setScrollDirection(null);
      if (onDragEnd) onDragEnd();
      if (shouldClose) handleClose(true);
    };

    sheetElement.addEventListener("touchstart", onSheetTouchStart, {
      passive: false,
    });
    sheetElement.addEventListener("touchmove", onSheetTouchMove, {
      passive: false,
    });
    sheetElement.addEventListener("touchend", onSheetTouchEnd, {
      passive: false,
    });
    return () => {
      sheetElement.removeEventListener("touchstart", onSheetTouchStart);
      sheetElement.removeEventListener("touchmove", onSheetTouchMove);
      sheetElement.removeEventListener("touchend", onSheetTouchEnd);
    };
  }, [handleClose, onDragStart, onDragEnd, disableDragToClose]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e) => {
      const currentY = e.clientY;
      const currentX = e.clientX;
      const deltaY = currentY - dragStartY;
      const deltaX = currentX - dragStartX;
      if (
        !scrollDirection &&
        (Math.abs(deltaY) > 15 || Math.abs(deltaX) > 15)
      ) {
        if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2)
          setScrollDirection("horizontal");
        else if (deltaY > Math.abs(deltaX) * 1.5)
          setScrollDirection("vertical");
      }
      if (scrollDirection === "vertical" && deltaY > 0) {
        e.stopPropagation();
        e.preventDefault();
        setDragCurrentY(deltaY);
      } else if (
        !scrollDirection &&
        deltaY > 0 &&
        Math.abs(deltaY) > Math.abs(deltaX)
      ) {
        setDragCurrentY(deltaY);
      } else {
        setDragCurrentY(0);
      }
    };
    const onMouseUp = (e) => {
      if (scrollDirection === "vertical" && dragCurrentY > 5) {
        e.stopPropagation();
        e.preventDefault();
        if (dragCurrentY > 150) handleClose(true);
      }
      setIsDragging(false);
      setDragStartY(0);
      setDragStartX(0);
      setDragCurrentY(0);
      setScrollDirection(null);
      if (onDragEnd) onDragEnd();
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [
    isDragging,
    dragStartY,
    dragStartX,
    dragCurrentY,
    scrollDirection,
    handleClose,
    onDragEnd,
  ]);

  if (!isOpen && !isClosing) return null;

  const content = (
    <div
      className="fixed inset-0"
      style={{
        zIndex: parseInt(zIndex.match(/\d+/)?.[0] || "9999"),
        pointerEvents: "auto",
      }}
      onClick={(e) => {
        const target = e.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest("select")
        )
          return;
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget) handleClose(false);
      }}
      onMouseDown={(e) => {
        const target = e.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest("select")
        )
          return;
        e.stopPropagation();
      }}
    >
      {/* Backdrop */}
      {!isClosing && shouldShowBackdrop && (
        <div
          className={cn(
            "fixed inset-0 bg-linear-to-t from-black/30 to-transparent",
            backdropClassName,
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.target === e.currentTarget) handleClose(false);
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) handleClose(false);
          }}
          aria-hidden="true"
          style={{
            opacity: !isMounted ? 0 : 1,
            transition: "opacity 350ms ease-in-out",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "fixed inset-x-0 bottom-0 pointer-events-auto flex justify-center",
          className,
        )}
        role="dialog"
        aria-modal="true"
        data-bottom-sheet="true"
        aria-labelledby={title ? "bottom-sheet-title" : undefined}
        style={{
          zIndex: 1,
          transform: isDragging
            ? `translateY(${dragCurrentY}px)`
            : isClosing || !isMounted
              ? "translateY(100%)"
              : "translateY(0)",
          transition: isDragging ? "none" : "transform 350ms ease-in-out",
          willChange: "transform",
        }}
      >
        <div
          ref={sheetContentRef}
          className={cn(
            "bg-(--color-surface) flex flex-col transition-all duration-300 ease-in-out w-full",
            maxWidth,
            "shadow-[0_-10px_20px_rgba(0,0,0,0.12)]",
            borderRadius,
          )}
          style={{
            maxHeight:
              adjustedMaxHeight || `min(${maxHeight}, ${viewportHeight}px)`,
            minHeight: keyboardActive ? "auto" : minHeight,
          }}
        >
          {/* Handle */}
          {showHandle && (
            <div
              ref={handleRef}
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
            >
              <div className="bg-stone-300 h-1 w-12 rounded-full" />
            </div>
          )}

          {/* Header */}
          {showHeader && (
            <div className="w-full relative flex items-center px-4 pt-1 pb-2 min-h-11">
              {headerBackButton && (
                <div className="cursor-pointer z-10" onClick={handleClose}>
                  <CaretLeftIcon size={28} />
                </div>
              )}
              {title && (
                <div
                  id="bottom-sheet-title"
                  className={cn(
                    "absolute inset-x-0 mx-auto px-14 font-bold text-(--color-text) uppercase text-center truncate pointer-events-none",
                    titleSize,
                  )}
                >
                  {title}
                </div>
              )}
              {customActionButton && (
                <div className="ml-auto shrink-0 cursor-pointer z-10">
                  {customActionButton}
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div
            className={cn(
              "overflow-y-auto overscroll-contain flex-1",
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return usePortal ? ReactDOM.createPortal(content, document.body) : content;
};

export default BottomSheet;
