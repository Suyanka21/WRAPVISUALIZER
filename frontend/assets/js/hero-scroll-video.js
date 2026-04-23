(function () {
  'use strict';

  // Scroll-controlled scrubbing of the landing hero video. Playback position
  // is driven by how far the user has scrolled through the page, not by real
  // time — the <video> element is never `.play()`ed. Kept in a dedicated
  // external file so CSP `script-src 'self'` (Stage F) stays intact.

  var video = document.getElementById('hero-video');
  if (!video) return;

  // Respect reduced-motion: leave the video on its first frame and skip the
  // scroll listener entirely. The poster / first frame remains visible as a
  // static hero image.
  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var rafPending = false;

  // Clamp the scroll fraction into [0, duration] and write it to the video.
  // We avoid unnecessary writes when `duration` is still NaN (metadata not
  // loaded yet) to keep mobile Safari from stalling on the first scroll.
  function syncVideoToScroll() {
    rafPending = false;
    var duration = video.duration;
    if (!duration || isNaN(duration)) return;

    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var fraction = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    if (fraction < 0) fraction = 0;
    else if (fraction > 1) fraction = 1;

    video.currentTime = duration * fraction;
  }

  // Scroll / resize handler. Coalesces bursts of events into a single
  // `syncVideoToScroll` call per animation frame via `rafPending`, and
  // short-circuits entirely when the user prefers reduced motion.
  function onScroll() {
    if (rafPending || reduceMotion) return;
    rafPending = true;
    window.requestAnimationFrame(syncVideoToScroll);
  }

  // `loadedmetadata` fires once `video.duration` is known. Run one initial
  // sync so the first paint matches the user's current scroll position
  // (important for deep-links and back/forward cache restores).
  video.addEventListener('loadedmetadata', syncVideoToScroll);
  // If metadata is already available (bfcache or a cached response beat
  // our listener), `loadedmetadata` will not fire again — sync immediately.
  if (video.readyState >= 1 /* HAVE_METADATA */) {
    syncVideoToScroll();
  }

  // Passive listeners — scroll should never block paint.
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // `pageshow` covers the bfcache restore case where `loadedmetadata` has
  // already fired in a previous life of the page.
  window.addEventListener('pageshow', syncVideoToScroll);
})();
