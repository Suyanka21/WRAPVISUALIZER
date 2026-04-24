(function () {
  'use strict';

  // Scroll-jacked hero animation. The outer `.hero-morph` section is tall
  // (300vh), and the inner `.hero-morph__stage` is `position: sticky` so
  // the car stays pinned to the viewport while the user scrolls. Scroll
  // progress through the outer section is mapped 1:1 to the frame index
  // of the LC300 morph sequence (all 240 ezgif JPGs in /lc30-morph/).
  // Once the outer section ends, the stage unpins and the next section
  // (trust bar / upload) scrolls in naturally.

  var section = document.querySelector('.hero-morph');
  var canvas = document.getElementById('hero-canvas');
  var overlay = document.getElementById('hero-overlay');
  if (!section || !canvas) return;

  var ctx = canvas.getContext('2d', { alpha: false });

  // The source sequence in /lc30-morph/ has 240 JPGs named
  // ezgif-frame-001.jpg … ezgif-frame-240.jpg. All 240 are used so the
  // morph plays smoothly under scrub.
  var TOTAL_FRAMES = 240;
  var frames = new Array(TOTAL_FRAMES);
  var loadedCount = 0;
  var firstFrameReady = false;
  var lastPaintedIndex = -1;
  var rafPending = false;

  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function framePath(index) {
    // index 0 → ezgif-frame-001.jpg, index 239 → ezgif-frame-240.jpg
    var num = index + 1;
    var padded = num < 10 ? '00' + num : num < 100 ? '0' + num : String(num);
    return '/lc30-morph/ezgif-frame-' + padded + '.jpg';
  }

  function sizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    if (dpr > 2) dpr = 2;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  // Cover-fit draw — scale to fill canvas, center-crop.
  function drawFrame(img) {
    if (!img || !img.naturalWidth) return;
    var cw = canvas.width;
    var ch = canvas.height;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var scale = Math.max(cw / iw, ch / ih);
    var sw = cw / scale;
    var sh = ch / scale;
    var sx = (iw - sw) / 2;
    var sy = (ih - sh) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  }

  // 0 at the moment the hero first touches the top of the viewport,
  // 1 at the moment the hero's bottom edge leaves the top of the viewport.
  function computeProgress() {
    var rect = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    var scrolled = -rect.top;
    var p = scrolled / total;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;
    return p;
  }

  // Pick the nearest frame already loaded to `idx` so scrubbing stays
  // visually continuous while batches are still streaming in.
  function pickFrame(idx) {
    if (frames[idx] && frames[idx].naturalWidth) return frames[idx];
    for (var d = 1; d < TOTAL_FRAMES; d++) {
      var lo = idx - d;
      var hi = idx + d;
      if (lo >= 0 && frames[lo] && frames[lo].naturalWidth) return frames[lo];
      if (hi < TOTAL_FRAMES && frames[hi] && frames[hi].naturalWidth)
        return frames[hi];
    }
    return null;
  }

  function syncFrameToScroll() {
    rafPending = false;
    if (!firstFrameReady) return;

    var p = computeProgress();
    var idx = Math.round(p * (TOTAL_FRAMES - 1));
    if (idx !== lastPaintedIndex) {
      var img = pickFrame(idx);
      if (img) {
        drawFrame(img);
        lastPaintedIndex = idx;
      }
    }

    if (overlay) {
      // Text is fully visible while the car is still plain black, fades
      // out through the middle of the morph (peaks of the transformation),
      // and stays hidden through the glossy-red reveal.
      var fadeStart = 0.25;
      var fadeEnd = 0.55;
      var t;
      if (p <= fadeStart) t = 1;
      else if (p >= fadeEnd) t = 0;
      else t = 1 - (p - fadeStart) / (fadeEnd - fadeStart);
      overlay.style.opacity = String(t);
      // Subtle parallax lift so the text feels like it's being pushed
      // off the stage rather than just flatly fading.
      overlay.style.transform = 'translateY(' + (-24 * (1 - t)).toFixed(1) + 'px)';
    }
  }

  function onScroll() {
    if (rafPending || reduceMotion) return;
    rafPending = true;
    window.requestAnimationFrame(syncFrameToScroll);
  }

  function onResize() {
    sizeCanvas();
    lastPaintedIndex = -1;
    syncFrameToScroll();
  }

  // Preload frames in batches so we don't saturate the connection or
  // starve the main thread. Prioritizes frame 0 so the hero shows
  // immediately; the rest stream in while the user is still reading.
  function preloadFrames() {
    var BATCH = 12;
    var idx = 0;

    function loadOne(j, onDone) {
      var img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.onload = function () {
        frames[j] = img;
        loadedCount++;
        if (j === 0 && !firstFrameReady) {
          firstFrameReady = true;
          sizeCanvas();
          drawFrame(img);
          lastPaintedIndex = 0;
        }
        if (onDone) onDone();
      };
      img.onerror = function () {
        loadedCount++;
        if (onDone) onDone();
      };
      img.src = framePath(j);
    }

    function loadBatch() {
      var end = Math.min(idx + BATCH, TOTAL_FRAMES);
      for (var i = idx; i < end; i++) {
        loadOne(i);
      }
      idx = end;
      if (idx < TOTAL_FRAMES) {
        // Schedule next batch after a tick so decode stays off the
        // critical rendering path.
        setTimeout(loadBatch, 80);
      } else {
        // All frames in: repaint at the current scroll position.
        syncFrameToScroll();
      }
    }

    // Load frame 0 first so the stage is never blank.
    loadOne(0, loadBatch);
  }

  sizeCanvas();
  preloadFrames();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.addEventListener('pageshow', syncFrameToScroll);
})();
