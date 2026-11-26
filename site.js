// Shared behaviour for every page. Each block checks for its own elements,
// so pages only pay for what they use.

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// How light is the page at a point? Looks through whatever sits there (images
// by their pixels, solid backgrounds by colour) and returns 0 (black) to 1
// (white). Used by the menu and the cursor to pick light or dark.
const backdropLuminance = (() => {
  const luminance = (r, g, b) => {
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const thumbs = new WeakMap();
  const imageLum = (img, x, y) => {
    if (!img.complete || !img.naturalWidth) return null;
    try {
      let data = thumbs.get(img);
      if (!data) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 24;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        data = ctx.getImageData(0, 0, 24, 24).data;
        thumbs.set(img, data);
      }
      const r = img.getBoundingClientRect();
      const px = Math.min(23, Math.max(0, Math.floor(((x - r.left) / r.width) * 24)));
      const py = Math.min(23, Math.max(0, Math.floor(((y - r.top) / r.height) * 24)));
      const i = (py * 24 + px) * 4;
      return luminance(data[i], data[i + 1], data[i + 2]);
    } catch (err) { return null; }
  };
  const contains = (el, x, y) => {
    const r = el.getBoundingClientRect();
    return r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  return (x, y, skip = () => false) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (skip(el)) continue;
      if (el.tagName === 'IMG') { const v = imageLum(el, x, y); if (v != null) return v; continue; }
      if (el.tagName === 'VIDEO' || el.tagName === 'CANVAS') return 0.05;
      const bg = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (bg && (bg[3] === undefined ? 1 : +bg[3]) > 0.5) return luminance(+bg[0], +bg[1], +bg[2]);
      // Background art that ignores the pointer (e.g. the home hero) is not
      // hit-tested, so look for media inside this element under the point.
      const media = [...el.querySelectorAll(':scope img, :scope video')].filter((m) => !skip(m) && contains(m, x, y)).pop();
      if (media) {
        const v = media.tagName === 'IMG' ? imageLum(media, x, y) : 0.05;
        if (v != null) return v;
      }
    }
    return 1;
  };
})();

// Mobile navigation
(function () {
  const nav = document.querySelector('.nav');
  const toggle = nav && nav.querySelector('.nav__toggle');
  if (!toggle) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setOpen(false); });
})();

// Pinned menu: the logo stays on the left and the links on the right. Once the
// page scrolls, a full-width frosted bar fades in behind them; the menu hides
// while scrolling down and returns on scroll up. The text colour flips between
// light and dark to suit whatever is behind the menu.
(function () {
  const nav = document.querySelector('.nav');
  const logo = nav && nav.querySelector('.nav__logo');
  const links = nav && nav.querySelector('.nav__links');
  if (!logo || !links) return;

  const wide = window.matchMedia('(min-width: 861px)');
  let scrolled = window.scrollY > 40;

  const layout = () => nav.classList.toggle('is-scrolled', scrolled);

  // Slide the menu away while scrolling down; bring it back on any scroll up.
  let lastY = window.scrollY;
  const direction = () => {
    const yNow = window.scrollY;
    const dy = yNow - lastY;
    if (Math.abs(dy) < 4) return;
    const keep = yNow < 120 || nav.classList.contains('is-open') || nav.contains(document.activeElement);
    nav.classList.toggle('is-hidden', dy > 0 && !keep);
    lastY = yNow;
  };

  // --- What colour is behind the menu? ---
  const skip = (el) => nav.contains(el) || el.closest('.toc');
  const lumAt = (x, y) => backdropLuminance(x, y, skip);
  const theme = () => {
    const r = links.getBoundingClientRect();
    const target = wide.matches && r.width ? r : nav.querySelector('.nav__toggle').getBoundingClientRect();
    const y = target.top + target.height / 2;
    const xs = [0.15, 0.5, 0.85].map((f) => target.left + target.width * f);
    const lum = xs.reduce((sum, x) => sum + lumAt(x, y), 0) / xs.length;
    const dark = lum < 0.35;
    nav.classList.toggle('is-on-dark', dark);
    nav.classList.toggle('is-on-light', !dark);
  };

  let queued = false;
  const update = () => {
    queued = false;
    const s = window.scrollY > 40;
    if (s !== scrolled) { scrolled = s; layout(); }
    direction();
    theme();
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  layout();
  theme();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('load', theme);
})();

// Hero headline: wrap each word so CSS can bring them into focus one by one.
(function () {
  const el = document.querySelector('[data-words]');
  if (!el || !root.classList.contains('js-motion')) return;

  let i = 0;
  const wrap = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const span = document.createElement('span');
          span.className = 'w';
          span.style.setProperty('--i', i++);
          span.textContent = part;
          frag.append(span);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        wrap(child);
      }
    });
  };
  el.setAttribute('aria-label', el.textContent.trim());
  wrap(el);
})();

// Hero constellations: draw a line from star to star, revealing each star as
// the line reaches it, then light up the whole sky once everything is joined.
(function () {
  const sky = document.querySelector('.hero__stars');
  if (!sky || !root.classList.contains('js-motion')) return;

  const NS = 'http://www.w3.org/2000/svg';
  const START = 0.8;   // seconds before the first line starts
  const DRAW = 12;     // seconds to draw every line, shared out by length
  const segments = [];
  const starTimes = new Map();
  const key = (x, y) => `${x},${y}`;

  sky.querySelectorAll('polyline').forEach((poly) => {
    const pts = poly.getAttribute('points').trim().split(/\s+/).map((p) => p.split(',').map(Number));
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      poly.before(line);
      segments.push({ line, from: key(x1, y1), to: key(x2, y2), len: Math.hypot(x2 - x1, y2 - y1) });
    }
    poly.remove();
  });

  const total = segments.reduce((sum, seg) => sum + seg.len, 0);
  let t = START;
  segments.forEach((seg, i) => {
    const dur = (seg.len / total) * DRAW;
    // A branch starts from a star that's already lit, so it never waits on a gap.
    if (!starTimes.has(seg.from)) starTimes.set(seg.from, t);
    seg.line.style.setProperty('--len', seg.len.toFixed(1));
    seg.line.style.setProperty('--dur', `${dur.toFixed(2)}s`);
    seg.line.style.setProperty('--delay', `${t.toFixed(2)}s`);
    t += dur;
    if (!starTimes.has(seg.to)) starTimes.set(seg.to, t - 0.08);
  });

  sky.querySelectorAll('.star').forEach((star) => {
    const at = starTimes.get(star.dataset.at);
    star.style.setProperty('--delay', `${(at ?? START).toFixed(2)}s`);
    // Each sparkle pulses at its own pace so they never blink in unison.
    star.style.setProperty('--tw-dur', `${(2.2 + Math.random() * 2.4).toFixed(2)}s`);
    star.style.setProperty('--tw-delay', `${(Math.random() * 2).toFixed(2)}s`);
  });

  setTimeout(() => sky.classList.add('is-lit'), (t + 0.35) * 1000);
})();

// Hero sky: click (or tap) anywhere on the blue to stamp a sparkling star there.
(function () {
  const hero = document.querySelector('.hero');
  const sky = hero && hero.querySelector('.hero__stars');
  if (!sky || !sky.getScreenCTM) return;

  const NS = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(NS, 'g');
  layer.setAttribute('class', 'hero__stamps');
  sky.append(layer);
  const MAX = 40;

  hero.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    // Only on the sky, not the white part of the cover.
    if (backdropLuminance(e.clientX, e.clientY) >= 0.3) return;
    const ctm = sky.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const r = 4 + Math.random() * 3;
    const q = r * 0.15;
    const { x, y } = pt;

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'stamp');
    g.style.setProperty('--tw-dur', `${(2.4 + Math.random() * 2.4).toFixed(2)}s`);
    g.style.setProperty('--tw-delay', `${(Math.random() * 1.5).toFixed(2)}s`);
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('class', 'star__halo');
    halo.setAttribute('cx', x);
    halo.setAttribute('cy', y);
    halo.setAttribute('r', (r * 1.5).toFixed(2));
    const star = document.createElementNS(NS, 'path');
    star.setAttribute('d', `M${x},${y - r} Q${x + q},${y - q} ${x + r},${y} Q${x + q},${y + q} ${x},${y + r} Q${x - q},${y + q} ${x - r},${y} Q${x - q},${y - q} ${x},${y - r}Z`);
    g.append(halo, star);

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'stamp__ring');
    ring.setAttribute('cx', x);
    ring.setAttribute('cy', y);
    ring.setAttribute('r', (r * 1.2).toFixed(2));
    ring.addEventListener('animationend', () => ring.remove());

    layer.append(g, ring);
    const stamps = layer.querySelectorAll('.stamp');
    if (stamps.length > MAX) stamps[0].remove();
  });
})();

// Hero parallax: feed the scroll position to CSS while the hero is visible.
(function () {
  const hero = document.querySelector('.hero');
  if (!hero || !root.classList.contains('js-motion')) return;
  let queued = false;
  const update = () => {
    queued = false;
    const y = Math.min(window.scrollY, hero.offsetHeight);
    hero.style.setProperty('--scroll', y.toFixed(1));
  };
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

// Reveal on scroll: fade blocks up as they enter the viewport.
(function () {
  const isHome = root.classList.contains('js-motion');
  const isCase = root.classList.contains('js-reveal');
  if (!isHome && !isCase) return;

  // Mirrors the selector lists in styles.css (home) and case.css (case studies).
  const groups = '.duo, .cards, .flaws, .pairs, .iterations, .trio, .outcomes, .learned, .grid, .stats, .tiles, .bento';
  const selector = isHome
    ? '.work'
    : [
        '.masthead > *',
        '.hero__frame',
        '.before-after',
        '.rule',
        '.footnote > *',
        `.section > :not(${groups})`,
        `:is(${groups}) > *`,
      ].join(', ');

  try {
    // Items that sit side by side come in one after another.
    document.querySelectorAll(isHome ? '.works__row' : groups).forEach((group) => {
      [...group.children].forEach((child, i) => {
        child.style.setProperty('--reveal-delay', `${Math.min(i, 3) * 90}ms`);
      });
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // Also show anything already scrolled past (e.g. a reload halfway down the page).
        const scrolledPast = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !scrolledPast) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });

    document.querySelectorAll(selector).forEach((item) => observer.observe(item));
  } catch (err) {
    // If anything goes wrong, show everything rather than leave it hidden.
    root.classList.remove('js-motion', 'js-reveal');
  }
})();

// Videos: play muted on a loop while on screen, pause when scrolled away.
(function () {
  const videos = document.querySelectorAll('video[data-autoplay]');
  if (!videos.length) return;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    // Respect the visitor's setting: no autoplay, but let them press play.
    videos.forEach((video) => { video.controls = true; });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) {
        // A missing or blocked file just leaves the poster frame showing.
        target.play().catch(() => {});
      } else {
        target.pause();
      }
    });
  }, { threshold: 0.2 });

  videos.forEach((video) => observer.observe(video));
})();

// Carousel: click-and-drag to scroll with a mouse (touch and trackpad scroll natively).
(function () {
  document.querySelectorAll('.carousel').forEach((el) => {
    let startX = 0;
    let startScroll = 0;
    let dragging = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) el.classList.add('is-dragging');
      el.scrollLeft = startScroll - dx;
    });
    const stop = () => {
      dragging = false;
      el.classList.remove('is-dragging');
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);

    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const step = el.clientWidth * 0.7 * (e.key === 'ArrowRight' ? 1 : -1);
      el.scrollBy({ left: step, behavior: 'smooth' });
    });
  });
})();

// "Beyond designing" canvas: an endless, tilted wall of work. The pieces are
// repeated to fill the space in loose columns of mixed sizes, and wrap around
// as you drag, so the wall never runs out. Clicking a piece opens it large.
(function () {
  const stage = document.querySelector('[data-drag-stage]');
  const canvas = stage && stage.querySelector('[data-drag-canvas]');
  if (!canvas) return;

  const TILT = -4 * Math.PI / 180;
  // Keep clean copies of the pieces; the wall is rebuilt from these.
  const templates = [...canvas.querySelectorAll('.beyond__item')].map((el) => el.cloneNode(true));
  const headEl = stage.querySelector('.beyond__head');
  const headTpl = headEl.cloneNode(true);
  headEl.remove();
  const find = (part) => templates.find((t) => t.innerHTML.includes(part));
  const featured = { mural: find('b-mural'), billboard: find('b-billboard'), speaking: find('b-speaking') };
  const ratioOf = (el) => {
    const [w, h] = el.style.getPropertyValue('--ratio').split('/').map(parseFloat);
    return w && h ? w / h : 4 / 3;
  };
  // A fixed sequence of "random" numbers, so the layout stays the same on resize.
  const rand = (i) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };
  // Small size differences only, so the wall feels even.
  const SIZES = [1, 0.95, 0.98, 0.92, 0.97, 0.94];

  let items = [];          // { el, bx, by, r }: a placed piece and its slight tilt
  let PW = 0, PH = 0;      // size of one repeat of the wall
  let shiftX = 0, shiftY = 0;
  let x = 0, y = 0;

  // Videos play only while on screen.
  const videoWatch = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) target.play().catch(() => {}); else target.pause();
    }), { threshold: 0.2 })
    : null;

  const build = () => {
    if (videoWatch) videoWatch.disconnect();
    canvas.replaceChildren();
    items = [];

    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const cos = Math.cos(TILT), sin = Math.abs(Math.sin(TILT));
    const coverW = Math.ceil(W * cos + H * sin);
    const coverH = Math.ceil(W * sin + H * cos);
    canvas.style.setProperty('--cw', `${coverW}px`);
    canvas.style.setProperty('--ch', `${coverH}px`);

    const colW = W >= 1100 ? 420 : W >= 700 ? 340 : 230;
    const gap = Math.round(colW * 0.14);

    // The heading is a piece of the wall too: measure it at column width.
    const headW = Math.round(colW * (W >= 900 ? 1.15 : 1));
    const probe = headTpl.cloneNode(true);
    probe.style.setProperty('--w', `${headW}px`);
    probe.style.visibility = 'hidden';
    canvas.append(probe);
    const headH = Math.ceil(probe.offsetHeight);
    probe.remove();

    const tallest = Math.max(headH, colW / Math.min(...templates.map(ratioOf)));
    // Enough columns and height that a piece leaving one edge has already
    // re-entered on the other side before it could be seen missing.
    const cols = Math.max(3, Math.ceil((coverW + colW + gap) / (colW + gap)));
    PW = cols * (colW + gap);
    const wantH = coverH + tallest + gap;
    shiftX = colW + gap;
    shiftY = tallest + gap;

    // The column that opens in the middle of the view holds the heading, with
    // the speaking photo under it, the mural to its left and the billboard to
    // its right, so those are the first things people see.
    const cc = Math.min(cols - 2, Math.max(1, Math.round((coverW / 2 + shiftX - colW / 2) / (colW + gap))));
    const lead = { [cc - 1]: featured.mural, [cc]: 'head', [cc + 1]: featured.billboard };
    const after = { [cc]: featured.speaking };

    let n = 0;
    const seen = new Set();
    const columns = [];
    // Every piece gets roughly the same area, so wide shots and tall ones read
    // as the same size (a tall piece is narrower, a wide one shorter). The
    // three featured pieces get more room than the rest.
    const area = colW * colW * 0.62;
    const sizeOf = (t, size, big) => {
      const a = big ? area * 1.7 : area;
      const w = Math.round(Math.min(big ? colW * 1.12 : colW, Math.sqrt(a * ratioOf(t))) * size);
      return { w, h: w / ratioOf(t) };
    };
    // The first appearance of each piece is the real one (focusable, read
    // out); repeats are decorative copies.
    const pieceOf = (t, size, big) => {
      const copy = seen.has(t);
      seen.add(t);
      return { t, ...sizeOf(t, size, big), copy };
    };
    const isFeatured = (t) => Object.values(featured).includes(t);
    // Is this piece already showing near (y0..y1) in a neighbouring column?
    const nearby = (c, t, y0, y1) => {
      const others = [columns[c - 1]];
      if (c === cols - 1) others.push(columns[0]);   // the wall wraps sideways
      return others.some((col) => col && col.col.some((p) => p.t === t && p.y < y1 + 160 && p.y + p.h > y0 - 160));
    };

    for (let c = 0; c < cols; c++) {
      const col = [];
      // Line the mural and billboard up with the middle of the heading.
      const start = lead[c] === 'head' ? 0 : rand(c + 1) * gap * 2;
      let h = 0;
      const push = (p) => { p.y = start + h; col.push(p); h += p.h + gap; };
      if (lead[c] === 'head') push({ head: true, w: headW, h: headH });
      else if (lead[c]) push(pieceOf(lead[c], 1, true));
      if (after[c]) push(pieceOf(after[c], 1, true));
      if (lead[c] && lead[c] !== 'head') {
        const shift = headH / 2 - col[0].h / 2 - start;
        col.forEach((p) => { p.y += shift; });
      }

      let k = (c * 4) % templates.length;   // stagger so neighbours differ
      while (h < wantH) {
        const prev = col.length ? col[col.length - 1].t : null;
        // Take the next piece in the cycle that isn't the one just above it,
        // isn't right beside its twin, and isn't one of the featured three.
        let pick = null;
        for (let tries = 0; tries < templates.length; tries++) {
          const t = templates[(k + tries) % templates.length];
          if (t === prev) continue;
          if (isFeatured(t)) continue;   // the featured three appear once, by the heading
          const { h: th } = sizeOf(t, SIZES[(n + c) % SIZES.length]);
          if (nearby(c, t, start + h, start + h + th)) continue;
          pick = t;
          k += tries + 1;
          break;
        }
        if (!pick) { pick = templates[k % templates.length]; k++; }
        push(pieceOf(pick, SIZES[(n + c) % SIZES.length]));
        n++;
      }
      // The bottom of a column meets its own top as the wall wraps; don't let
      // the same piece end up touching itself there.
      const first = col[0].t;
      if (col.length > 2 && first && col[col.length - 1].t === first) {
        const swap = templates.find((t) => t !== first && t !== col[col.length - 2].t && !isFeatured(t));
        const last = col.pop();
        h -= last.h + gap;
        push(pieceOf(swap, SIZES[(n + c) % SIZES.length]));
      }
      columns.push({ col, h, start });
    }
    PH = Math.max(...columns.map((c) => c.h));

    let headX = 0, headY = 0;
    columns.forEach(({ col, h }, c) => {
      // Spread any spare height evenly so every column repeats seamlessly.
      const extra = (PH - h) / col.length;
      let by = col[0].y;
      col.forEach((piece, j) => {
        let el;
        let r;
        let bx;
        if (piece.head) {
          el = headTpl.cloneNode(true);
          el.style.setProperty('--w', `${piece.w}px`);
          r = (-TILT * 180 / Math.PI).toFixed(2);   // keep the words level
          bx = c * (colW + gap) + (colW - piece.w) / 2;
          headX = bx;
          headY = by;
        } else {
          el = piece.t.cloneNode(true);
          el.style.setProperty('--w', `${piece.w}px`);
          r = ((rand(c * 31 + j) - 0.5) * 3).toFixed(2);
          bx = c * (colW + gap) + ((lead[c] && j === 0) || (after[c] && j === 1) ? (colW - piece.w) / 2 : (colW - piece.w) * rand(c * 17 + j * 5 + 2));
          if (piece.copy) {
            el.setAttribute('aria-hidden', 'true');
            el.tabIndex = -1;
          } else {
            el.tabIndex = 0;
            el.setAttribute('role', 'button');
            const label = el.querySelector('img')?.alt || el.querySelector('video')?.getAttribute('aria-label') || '';
            el.setAttribute('aria-label', `Open: ${label}`);
          }
          const video = el.querySelector('video');
          if (video && videoWatch) videoWatch.observe(video);
        }
        canvas.append(el);
        items.push({ el, bx, by, r });
        by += piece.h + gap + extra;
      });
    });

    // Open with the heading in the middle of the view.
    x = coverW / 2 - headX - headW / 2;
    y = coverH / 2 - headY - headH / 2;
    apply();
  };

  const wrap = (v, size) => ((v % size) + size) % size;
  const apply = () => {
    for (const it of items) {
      const px = wrap(it.bx + x + shiftX, PW) - shiftX;
      const py = wrap(it.by + y + shiftY, PH) - shiftY;
      it.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) rotate(${it.r}deg)`;
    }
  };

  // --- Dragging, with a little glide after letting go ---
  let vx = 0, vy = 0;
  let lastX = 0, lastY = 0, lastT = 0;
  let startX = 0, startY = 0;
  let pressed = null;      // the piece under the pointer when it went down
  let dragging = false;
  let touch = false;
  let frame = 0;

  // After letting go, the wall carries on in the throw direction and settles
  // on a spring, overshooting a touch and bouncing back.
  let tx = 0, ty = 0;
  let sx = 0, sy = 0;      // spring velocity, px per second
  let lastFrame = 0;
  const glide = (now) => {
    const dt = lastFrame ? Math.min(0.032, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    const K = 90, D = 13.5;  // stiffness and damping: a gentle, small bounce
    sx += (K * (tx - x) - D * sx) * dt;
    sy += (K * (ty - y) - D * sy) * dt;
    x += sx * dt;
    y += sy * dt;
    apply();
    if (Math.abs(tx - x) + Math.abs(ty - y) > 0.3 || Math.abs(sx) + Math.abs(sy) > 4) frame = requestAnimationFrame(glide);
    else { x = tx; y = ty; apply(); }
  };
  const throwFrom = () => {
    // Project where the throw would carry the wall, then spring there.
    tx = x + vx * 260;
    ty = y + vy * 260;
    sx = vx * 1000;
    sy = vy * 1000;
    lastFrame = 0;
    frame = requestAnimationFrame(glide);
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(frame);
    dragging = true;
    touch = e.pointerType !== 'mouse';
    pressed = e.target.closest('.beyond__item');
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    lastT = performance.now();
    vx = vy = 0;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    // Move in the wall's own (tilted) directions so it follows the pointer.
    const sx = e.clientX - lastX;
    const sy = touch ? 0 : e.clientY - lastY;
    const dx = sx * Math.cos(-TILT) - sy * Math.sin(-TILT);
    const dy = sx * Math.sin(-TILT) + sy * Math.cos(-TILT);
    x += dx;
    y += dy;
    vx = dx / dt;
    vy = dy / dt;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    apply();
  });

  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (e.type === 'pointerup' && moved < 6 && pressed) { open(pressed); return; }
    if (!reduceMotion) throwFrom();
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  canvas.addEventListener('keydown', (e) => {
    const item = e.target.closest('.beyond__item');
    if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(item); }
  });

  // --- Lightbox ---
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Enlarged piece');
  box.innerHTML = '<button class="lightbox__close" type="button" aria-label="Close">×</button><figure class="lightbox__figure"></figure>';
  document.body.append(box);
  const holder = box.querySelector('.lightbox__figure');
  const closeBtn = box.querySelector('.lightbox__close');
  let returnTo = null;

  const open = (item) => {
    holder.replaceChildren();
    const img = item.querySelector('img');
    const video = item.querySelector('video');
    let media;
    if (img) {
      media = document.createElement('img');
      media.src = img.currentSrc || img.src;
      media.alt = img.alt;
    } else if (video) {
      media = document.createElement('video');
      media.src = video.querySelector('source')?.src || video.currentSrc;
      media.poster = video.poster;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.controls = true;
      media.setAttribute('aria-label', video.getAttribute('aria-label') || '');
      if (!reduceMotion) media.autoplay = true;
    }
    if (media) holder.append(media);
    const text = item.querySelector('figcaption')?.textContent;
    if (text) {
      const cap = document.createElement('figcaption');
      cap.className = 'lightbox__caption';
      cap.textContent = text;
      holder.append(cap);
    }
    returnTo = item;
    box.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    closeBtn.focus({ preventScroll: true });
  };
  const close = () => {
    if (!box.classList.contains('is-open')) return;
    box.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    holder.querySelector('video')?.pause();
    if (returnTo && returnTo.tabIndex === 0) returnTo.focus({ preventScroll: true });
  };
  box.addEventListener('click', (e) => { if (!e.target.closest('img, video')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });
  build();
})();

// About page: "Things that I really care about". Clicking a topic opens its
// story and brings its photos to the front of the pile, stacked large; the
// rest stay scattered behind, barely there. Clicking the stack deals the front
// photo to the back. Clicking the open topic again, or anywhere outside the
// photos, closes it and re-scatters the whole pile.
(function () {
  const pile = document.querySelector('[data-pile]');
  const list = document.querySelector('[data-cares]');
  if (!pile) return;

  const photos = [...pile.querySelectorAll('img')];
  const TILTS = [0, -4, 6, -6, 4];
  let current = null;

  const scatter = () => {
    const order = photos.map((_, i) => i + 1).sort(() => Math.random() - 0.5);
    photos.forEach((photo, i) => {
      photo.style.setProperty('--x', Math.round(Math.random() * 64));
      photo.style.setProperty('--y', Math.round(Math.random() * 60));
      photo.style.setProperty('--r', Math.round(Math.random() * 28 - 14));
      if (!photo.classList.contains('is-focus')) photo.style.zIndex = order[i];
    });
  });
})();

// Case studies: a side menu for jumping between the parts of the page.
// Built from every element with a data-toc label, in page order.
(function () {
  const sections = [...document.querySelectorAll('[data-toc][id]')];
  const main = document.querySelector('main');
  if (sections.length < 2 || !main) return;

  const nav = document.createElement('nav');
  nav.className = 'toc';
  nav.setAttribute('aria-label', 'On this page');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toc__toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M1.5 3.5h11M1.5 7h11M1.5 10.5h7"/></svg>' +
    '<span class="visually-hidden">On this page: </span><span class="toc__current"></span>';
  const current = toggle.querySelector('.toc__current');

  const list = document.createElement('ol');
  list.className = 'toc__list';
  const links = sections.map((section) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.textContent = section.dataset.toc;
    item.append(link);
    list.append(item);
    return link;
  });

  nav.append(toggle, list);
  main.before(nav);
  root.classList.add('has-toc');

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setOpen(false); });

  links.forEach((link, i) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setOpen(false);
      sections[i].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', link.hash);
    });
  });

  const footer = document.querySelector('.site-footer');
  const hero = document.querySelector('.hero');
  const wide = window.matchMedia('(min-width: 960px)');
  let active = -1;
  let queued = false;

  const update = () => {
    queued = false;
    const h = window.innerHeight;

    // The current part is the last one whose top has passed the upper third of the screen.
    let index = 0;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= h * 0.35) index = i;
    });
    if (index !== active) {
  };

  // topic = null puts everything back: every photo visible and scattered.
  const focus = (topic) => {
    current = topic;
    pile.classList.toggle('is-idle', !topic);
    if (list) {
      list.querySelectorAll('li').forEach((li) => {
        const on = li.querySelector('button').dataset.topic === topic;
        li.classList.toggle('is-active', on);
        li.querySelector('button').setAttribute('aria-expanded', String(on));
      });
    }
    let n = 0;
    photos.forEach((photo) => {
      const on = !!topic && photo.dataset.topic === topic;
      photo.classList.toggle('is-focus', on);
      if (on) {
        photo.style.setProperty('--fr', TILTS[n % TILTS.length]);
        photo.style.zIndex = 30 + n;
        n++;
      } else if (Number(photo.style.zIndex) >= 30) {
        photo.style.zIndex = '';
      }
    });
    if (!topic) scatter();
  };

  if (list) {
    list.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-topic]');
      if (!button) return;
      const topic = button.dataset.topic;
      focus(topic === current ? null : topic);
    });
    const first = list.querySelector('.is-active button') || list.querySelector('button');
    if (first) focus(first.dataset.topic);
  }

  // Click the stack: the front photo slides out and tucks in at the back.
  // Click a photo from another topic: switch to that topic.
  let dealing = false;
  pile.addEventListener('click', (e) => {
    const photo = e.target.closest('img');
    if (!photo) return;
    if (!photo.classList.contains('is-focus')) { focus(photo.dataset.topic); return; }
    if (dealing) return;
    const stack = photos.filter((p) => p.classList.contains('is-focus'))
      .sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
    if (stack.length < 2) return;
    const front = stack[stack.length - 1];
    dealing = true;
    front.classList.add('is-dealt');
    setTimeout(() => {
      // Everyone else moves up one; the front photo goes to the bottom.
      stack.slice(0, -1).forEach((p, k) => { p.style.zIndex = 31 + k; });
      front.style.zIndex = 30;
      front.classList.remove('is-dealt');
      setTimeout(() => { dealing = false; }, 350);
    }, reduceMotion ? 0 : 320);
  });

  // Anywhere else on the page closes the open topic.
  document.addEventListener('click', (e) => {
    if (!current) return;
    if (e.target.closest('[data-pile] img, [data-cares] button, .pile__shuffle')) return;
    focus(null);
      active = index;

  const button = pile.querySelector('.pile__shuffle');
  if (button) {
    button.addEventListener('click', () => {
      scatter();
      // Reshuffle the stack's tilts too, so the front pile feels re-dealt.
      const stack = photos.filter((p) => p.classList.contains('is-focus'));
      stack.sort(() => Math.random() - 0.5).forEach((p, k) => {
        p.style.setProperty('--fr', TILTS[k % TILTS.length]);
        p.style.zIndex = 30 + k;
      });
    });
  }
      links.forEach((link, i) => {
        if (i === index) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      current.textContent = sections[index].dataset.toc;
    }

    // On wide screens the menu sits still, level with where the cover image
    // starts on the page (pulled up only if the window is too short to fit it).
    if (wide.matches && hero) {
      const start = hero.getBoundingClientRect().top + window.scrollY - 5;
      const fit = window.innerHeight - nav.offsetHeight - 24;
      nav.style.setProperty('--toc-top', `${Math.max(24, Math.min(start, fit))}px`);
    }

    // Always there, except over the footer.
    const shown = !(footer && footer.getBoundingClientRect().top < h * 0.85);
    nav.classList.toggle('is-shown', shown);
    if (!shown) setOpen(false);
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
})();

// Cursor: a single sparkle follows the mouse in place of the arrow. It turns
// when hovering anything clickable (opening a "See project" label beside it on
// case study cards), and swaps from blue to white over dark
// areas so it never disappears into the background.
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const spark = document.createElement('div');
  spark.className = 'cursor-sparkle';
  spark.setAttribute('aria-hidden', 'true');
  spark.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5Q13.4 10.6 22.5 12Q13.4 13.4 12 22.5Q10.6 13.4 1.5 12Q10.6 10.6 12 1.5Z"/></svg>'
    + '<span class="cursor-sparkle__label">See project</span>';
  document.body.append(spark);
  root.classList.add('has-sparkle');

  const clickable = 'a, button, [role="button"], label, summary, select, input, textarea, .pill, .pile img.is-focus';
  let queued = false;
  let px = 0, py = 0;
  const check = () => {
    queued = false;
    root.classList.toggle('cursor-on-dark', backdropLuminance(px, py) < 0.3);
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    px = e.clientX;
    py = e.clientY;
    spark.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    const t = e.target.closest ? e.target : null;
    // The Beyond canvas shows the grab hand instead.
    const inCanvas = !!(t && t.closest('.beyond__stage'));
    spark.classList.toggle('is-shown', !inCanvas);
    spark.classList.toggle('is-hovering', !!(t && t.closest(clickable)));
    // Case study cards also get a "See project" label (not the coming-soon one).
    spark.classList.toggle('is-project', !!(t && t.closest('a.work')));
    if (!queued) { queued = true; setTimeout(() => requestAnimationFrame(check), 60); }
  }, { passive: true });
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) spark.classList.remove('is-shown'); });
})();

// Star field: [data-star-trail] sections carry a faint grid of tiny stars in
// their background. Moving the cursor across the section makes the stars
// around its path bloom into bigger, grainy blues that then shrink back.
(function () {
  const sections = document.querySelectorAll('[data-star-trail]');
  if (!sections.length || reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  // electric, cobalt, royal, sky, cyan, icy
  const blues = ['#2b45ff', '#1f3fb8', '#3b5fd9', '#5fb4f2', '#3fc4e8', '#a9d6fb'];
  const SPRITE = 64;
  const GAP = 30;          // grid spacing
  const REST = 2;          // star size at rest
  const HALF = 0.7;        // seconds for a bloom to halve: the trail tapers fast,
                           // then its smallest stars linger (~4.5s to clear)
  const SPRING = 120;      // pull of each star toward its bloom size
  const DAMP = 8;          // low damping = a little bounce as it grows

  // Each star is drawn once to a small canvas: a four-point silhouette with
  // pinched, curved sides, roughened with per-pixel grain.
  const makeSprite = (color) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SPRITE;
    const ctx = canvas.getContext('2d');
    const c = SPRITE / 2;
    const r = SPRITE / 2 - 1;
    const k = r * 0.13;
    ctx.beginPath();
    ctx.moveTo(c, c - r);
    ctx.quadraticCurveTo(c + k, c - k, c + r, c);
    ctx.quadraticCurveTo(c + k, c + k, c, c + r);
    ctx.quadraticCurveTo(c - k, c + k, c - r, c);
    ctx.quadraticCurveTo(c - k, c - k, c, c - r);
    ctx.fillStyle = color;
    ctx.fill();
    const img = ctx.getImageData(0, 0, SPRITE, SPRITE);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const n = (Math.random() - 0.5) * 46 + (Math.random() < 0.04 ? 40 : 0);
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };
  const sprites = blues.map(makeSprite);

  sections.forEach((section) => {
    const layer = document.createElement('div');
    layer.className = 'star-trail';
    layer.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    layer.append(canvas);
    section.prepend(layer);
    const ctx = canvas.getContext('2d');

    // One entry per grid point across the whole section.
    let cols = 0;
    let rows = 0;
    let energy;   // 0 = at rest, 1 = full bloom
    let peak;     // how big this star gets when fully bloomed
    let hue;      // which blue
    let tilt;     // slight rotation
    let jx;       // small offsets so the grid doesn't look ruled
    let jy;
    let val;      // springy size that chases energy
    let vel;
    let woke;     // energy at the moment it last woke (for drift progress)
    let dirX;     // direction it drifts away from the cursor as it fades
    let dirY;
    let reach;    // how far it drifts
    let spin;

    const build = () => {
      const w = layer.offsetWidth;
      const h = layer.offsetHeight;
      cols = Math.ceil(w / GAP) + 1;
      rows = Math.ceil(h / GAP) + 1;
      const n = cols * rows;
      energy = new Float32Array(n);
      peak = new Float32Array(n);
      hue = new Uint8Array(n);
      tilt = new Float32Array(n);
      jx = new Float32Array(n);
      jy = new Float32Array(n);
      val = new Float32Array(n);
      vel = new Float32Array(n);
      woke = new Float32Array(n);
      dirX = new Float32Array(n);
      dirY = new Float32Array(n);
      reach = new Float32Array(n);
      spin = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        peak[i] = 7 + Math.random() * 15;
        hue[i] = Math.floor(Math.random() * sprites.length);
        tilt[i] = (Math.random() - 0.5) * 0.5;
        jx[i] = (Math.random() - 0.5) * 6;
        jy[i] = (Math.random() - 0.5) * 6;
      }
    };

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let running = false;
    let lastFrame = 0;

    const draw = (now) => {
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      lastFrame = now;

      // The canvas is viewport-sized and sticky; find which part of the
      // section it is currently showing.
      const offset = canvas.getBoundingClientRect().top - layer.getBoundingClientRect().top;
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      ctx.clearRect(0, 0, cw, ch);

      const r0 = Math.max(0, Math.floor(offset / GAP) - 1);
      const r1 = Math.min(rows - 1, Math.ceil((offset + ch) / GAP) + 1);
      let active = false;
      for (let r = r0; r <= r1; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x0 = c * GAP + jx[i];
          const y0 = r * GAP + jy[i] - offset;
          let e = energy[i];
          if (e > 0) {
            e *= Math.pow(0.5, dt / HALF);
            if (e < 0.012) e = 0;
            energy[i] = e;
          }
          const target = e ** 1.4;   // mid energies read clearly smaller

          // Spring the visible size toward the energy, in small steps so
          // the bounce stays stable at any frame rate.
          let v = val[i];
          let w = vel[i];
          if (e > 0 || v > 0.002 || w > 0.002 || w < -0.002) {
            for (let t = dt; t > 0; t -= 1 / 120) {
              const h = Math.min(t, 1 / 120);
              w += (SPRING * (target - v) - DAMP * w) * h;
              v += w * h;
            }
            if (e === 0 && Math.abs(v) < 0.002 && Math.abs(w) < 0.002) { v = 0; w = 0; }
            val[i] = v;
            vel[i] = w;
            if (v || w || e) active = true;
          }

          const bloom = Math.max(0, v);
          const shown = Math.min(1, bloom * 1.5);

          // The resting dot gives way while its star is out.
          if (shown < 1) {
            ctx.globalAlpha = 0.22 * (1 - shown);
            ctx.drawImage(sprites[hue[i]], x0 - REST / 2, y0 - REST / 2, REST, REST);
          }
          if (bloom > 0.01) {
            // As it fades, the star drifts outward and turns, then is gone.
            const p = woke[i] ? Math.min(1, Math.max(0, (woke[i] - e) / woke[i])) : 1;
            const go = p * p;
            const sz = REST + (peak[i] - REST) * bloom;
            ctx.globalAlpha = shown;
            ctx.save();
            ctx.translate(x0 + dirX[i] * reach[i] * go, y0 + dirY[i] * reach[i] * go);
            ctx.rotate(tilt[i] * bloom + spin[i] * go);
            ctx.drawImage(sprites[hue[i]], -sz / 2, -sz / 2, sz, sz);
            ctx.restore();
          }
        }
      }
      ctx.globalAlpha = 1;
      if (active) requestAnimationFrame(draw);
      else { running = false; lastFrame = 0; }
    };
    const kick = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(draw);
    };

    // Wake the stars around a point; closer ones bloom more.
    const wake = (x, y, radius) => {
      const c0 = Math.max(0, Math.floor((x - radius) / GAP));
      const c1 = Math.min(cols - 1, Math.ceil((x + radius) / GAP));
      const r0 = Math.max(0, Math.floor((y - radius) / GAP));
      const r1 = Math.min(rows - 1, Math.ceil((y + radius) / GAP));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const d = Math.hypot(c * GAP - x, r * GAP - y);
          if (d >= radius) continue;
          const i = r * cols + c;
          const f = 1 - d / radius;
          const e = f * f * (0.8 + Math.random() * 0.2);   // big at the cursor, small at the edges
          if (e > energy[i]) {
            // A star waking from rest picks a fresh blue and size.
            if (val[i] < 0.05) {
              hue[i] = Math.floor(Math.random() * sprites.length);
              peak[i] = 7 + Math.random() * 15;
            }
            energy[i] = e;
            woke[i] = e;
            // It will scatter away from the cursor as it fades.
            const ox = c * GAP - x + (Math.random() - 0.5) * 8;
            const oy = r * GAP - y + (Math.random() - 0.5) * 8;
            const len = Math.hypot(ox, oy) || 1;
            dirX[i] = ox / len;
            dirY[i] = oy / len;
            reach[i] = 10 + Math.random() * 18;
            spin[i] = (Math.random() - 0.5) * 1.6;
          }
        }
      }
    };

    let last = null;
    let lastT = 0;
    section.addEventListener('pointerleave', () => { last = null; });
    section.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const rect = layer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = e.timeStamp;
      if (!last) { last = { x, y }; lastT = now; return; }
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) return;   // a resting cursor wakes nothing new
      const speed = dist / Math.max(8, now - lastT);
      const radius = 55 + Math.min(55, speed * 30);   // faster = wider wake
      // Follow the actual path, a step at a time.
      const steps = Math.ceil(dist / (GAP / 2));
      for (let s = 1; s <= steps; s++) wake(last.x + (dx * s) / steps, last.y + (dy * s) / steps, radius);
      last = { x, y };
      lastT = now;
      kick();
    }, { passive: true });

    const refresh = () => { if (!running) { running = true; requestAnimationFrame(draw); } };
    window.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', () => { build(); size(); refresh(); });
    build();
    size();
    refresh();
  });
})();
