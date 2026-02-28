import React, { createContext, useContext, useEffect, useState } from "react";

const BrowserContext = createContext(null);

export const useBrowser = () => {
  const context = useContext(BrowserContext);
  if (!context) {
    throw new Error("useBrowser must be used within BrowserProvider");
  }
  return context;
};

export const BrowserProvider = ({ children }) => {
  const [browserInfo, setBrowserInfo] = useState(() => detectBrowser());

  useEffect(() => {
    const handleResize = () => setBrowserInfo(detectBrowser());

    const setVHProperty = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    setVHProperty();
    window.addEventListener("resize", handleResize);
    window.addEventListener("resize", setVHProperty);
    window.addEventListener("orientationchange", setVHProperty);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("resize", setVHProperty);
      window.removeEventListener("orientationchange", setVHProperty);
    };
  }, []);

  return (
    <BrowserContext.Provider value={browserInfo}>
      {children}
    </BrowserContext.Provider>
  );
};

const detectBrowser = () => {
  if (typeof window === "undefined") {
    return {
      isMobile: false, isIOS: false, isAndroid: false,
      isChrome: false, isSafari: false, isFirefox: false, isEdge: false,
      browser: "Server", supportsViewportUnits: false,
      viewportHeight: 0, viewportWidth: 0, userAgent: "",
    };
  }

  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(userAgent);
  const isMobile = isIOS || isAndroid || /webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  const isChrome = /Chrome/i.test(userAgent) && !/Edge|Edg/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|Edg/i.test(userAgent);
  const isFirefox = /Firefox|FxiOS/i.test(userAgent);
  const isEdge = /Edge|Edg/i.test(userAgent);

  const isMobileChrome = isMobile && (isChrome || /CriOS/i.test(userAgent));
  const isMobileSafari = isIOS && isSafari;
  const isMobileFirefox = isMobile && (isFirefox || /FxiOS/i.test(userAgent));
  const isMobileEdge = isMobile && isEdge;

  const supportsViewportUnits =
    typeof CSS !== "undefined" && CSS.supports && CSS.supports("height", "100dvh");

  let browserName = "Unknown";
  if (isMobile) {
    if (isMobileChrome) browserName = "Chrome";
    else if (isMobileSafari) browserName = "Safari";
    else if (isMobileFirefox) browserName = "Firefox";
    else if (isMobileEdge) browserName = "Edge";
  } else {
    browserName = "Desktop";
  }

  return {
    isMobile,
    isIOS,
    isAndroid,
    isChrome: isMobileChrome,
    isSafari: isMobileSafari,
    isFirefox: isMobileFirefox,
    isEdge: isMobileEdge,
    browser: browserName,
    supportsViewportUnits,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    userAgent,
  };
};

export default useBrowser;
