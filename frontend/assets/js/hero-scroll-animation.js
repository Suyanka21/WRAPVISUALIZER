(function () {
  'use strict';

  // Scroll-controlled frame animation for the landing hero. Replaces the
  // previous <video>-based approach with a <canvas> driven by sequential
  // JPEG frames from /lc30-morph/. Only every 2nd frame is loaded (odd
  // numbered: 001, 003, 005, …, 239) to cap the total at 120 frames.

  var canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');

  var TOTAL_FRAMES = 120;
  var frames = new Array(TOTAL_FRAMES);
  var loadedCount = 0;
  var firstFrameReady = false;
  var currentFrame = 0;
  var rafPending = false;

  // Respect reduced-motion: show only the first frame, skip scroll listener.
  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Build the file name for a given index (0-based). We use every 2nd
  // source frame: index 0 → frame 001, index 1 → frame 003, etc.
  function framePath(index) {
    var num = index * 2 + 1; // 1, 3, 5, …, 239
    var padded = String(num).padStart(3, '0');
    return '/lc30-morph/ezgif-frame-' + padded + '.jpg';
  }

  // Draw a frame to the canvas, scaling to fill (object-cover behavior).
  function drawFrame(img) {
    if (!img || !img.naturalWidth) return;

    var cw = canvas.width;
    var ch = canvas.height;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;

    // Cover: scale so the image fills the canvas, then center-crop.
    var scale = Math.max(cw / iw, ch / ih);
    var sw = cw / scale;
    var sh = ch / scale;
    var sx = (iw - sw) / 2;
    var sy = (ih - sh) / 2;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  }

  // Size the canvas to match its CSS layout dimensions (retina-aware).
  function sizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    // Cap DPR at 2 to keep memory usage reasonable on 3x screens.
    if (dpr > 2) dpr = 2;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }

  // Map scroll position → frame index and paint.
  function syncFrameToScroll() {
    rafPending = false;
    if (!firstFrameReady) return;

    var rect = canvas.getBoundingClientRect();
    var heroHeight = rect.height;
    if (heroHeight <= 0) return;

    var scrollY = window.scrollY || window.pageYOffset || 0;
    var heroTop = rect.top + scrollY;
    var fraction = (scrollY - heroTop) / heroHeight;
    if (fraction < 0) fraction = 0;
    else if (fraction > 1) fraction = 1;

    var idx = Math.floor(fraction * (TOTAL_FRAMES - 1));
    if (idx === currentFrame && loadedCount > 1) return; // already painted
    currentFrame = idx;

    var img = frames[idx];
    if (img && img.complete && img.naturalWidth) {
      drawFrame(img);
    }
  }

  function onScroll() {
    if (rafPending || reduceMotion) return;
    rafPending = true;
    window.requestAnimationFrame(syncFrameToScroll);
  }

  // Preload frames in batches to avoid blocking the main thread and network.
  function preloadFrames() {
    var BATCH = 10;
    var idx = 0;

    function loadBatch() {
      var end = Math.min(idx + BATCH, TOTAL_FRAMES);
      for (var i = idx; i < end; i++) {
        (function (j) {
          var img = new Image();
          img.onload = function () {
            frames[j] = img;
            loadedCount++;
            if (j === 0 && !firstFrameReady) {
              firstFrameReady = true;
              sizeCanvas();
              drawFrame(img);
            }
          };
          img.onerror = function () {
            loadedCount++;
          };
          img.src = framePath(j);
        })(i);
      }
      idx = end;
      if (idx < TOTAL_FRAMES) {
        setTimeout(loadBatch, 100);
      }
    }

    loadBatch();
  }

  // Resize handler — re-size canvas and repaint current frame.
  function onResize() {
    sizeCanvas();
    var img = frames[currentFrame];
    if (img && img.complete && img.naturalWidth) {
      drawFrame(img);
    }
  }

  // Initialize
  sizeCanvas();
  preloadFrames();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pageshow', syncFrameToScroll);
})();
