/**
 * Screenshot capture utility that periodically captures the app and sends to parent.
 * Uses html2canvas to capture the DOM and postMessage to send to AppGen.
 */

let screenshotInterval: ReturnType<typeof setInterval> | null = null;
let lastScreenshotTime = 0;
let hasInitialScreenshot = false;
const SCREENSHOT_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MIN_SCREENSHOT_GAP = 30 * 1000; // Minimum 30 seconds between screenshots

async function captureScreenshot(force = false) {
  if (typeof window === 'undefined') return;
  if (!window.parent || window.parent === window) return;
  
  const now = Date.now();
  if (!force && now - lastScreenshotTime < MIN_SCREENSHOT_GAP) return;

  try {
    // Dynamically import html2canvas to avoid SSR issues
    const html2canvas = (await import('html2canvas')).default;
    
    // Get the main element or document body
    const targetElement = document.querySelector('main') || document.body;
    
    // Capture the screenshot
    const canvas = await html2canvas(targetElement, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: 1, // Lower scale for faster capture
      logging: false,
      imageTimeout: 5000,
      removeContainer: true,
    });
    
    // Convert to base64
    const dataUrl = canvas.toDataURL('image/png', 0.8);
    
    // Send to parent
    try {
      if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
        window.parent.postMessage(
          {
            type: 'appgen:screenshot',
            data: dataUrl,
          },
          '*'
        );
        lastScreenshotTime = now;
        hasInitialScreenshot = true;
      }
    } catch (err) {
      console.error('[AppGen] Failed to send screenshot to parent:', err);
    }
  } catch (error) {
    console.error('[AppGen] Failed to capture screenshot:', error);
  }
}

// Start capturing screenshots after the app loads
function initScreenshotCapture() {
  if (typeof window === 'undefined') return;
  if (!window.parent || window.parent === window) return;

  // Notify parent that screenshot utility is ready
  try {
    if (typeof window.parent.postMessage === 'function') {
      window.parent.postMessage({ type: 'appgen:screenshotReady' }, '*');
    }
  } catch { /* ignore */ }

  // Take initial screenshot when app is fully rendered
  const captureInitialScreenshot = () => {
    if (hasInitialScreenshot) return;
    
    // Wait for the page to be fully rendered
    if (document.readyState === 'complete') {
      // Additional delay to ensure React has finished rendering
      setTimeout(() => {
        captureScreenshot(true);
      }, 2000);
    } else {
      window.addEventListener('load', () => {
        setTimeout(() => captureScreenshot(true), 2000);
      });
    }
  };

  // Start interval for periodic screenshots
  const startInterval = () => {
    if (screenshotInterval) return;
    // Start periodic screenshots
    screenshotInterval = setInterval(() => captureScreenshot(false), SCREENSHOT_INTERVAL);
  };

  // Initialize
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    captureInitialScreenshot();
    startInterval();
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      captureInitialScreenshot();
      startInterval();
    });
  }

  // Listen for manual screenshot requests from parent
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'appgen:captureScreenshot') {
      captureScreenshot(true); // Force capture when requested
    }
  });
}

// Auto-initialize when this module is imported
if (typeof window !== 'undefined') {
  initScreenshotCapture();
}

export { captureScreenshot, initScreenshotCapture };
