// Draggable art cards in the "Beyond designing" section
document.querySelectorAll('.drag-card').forEach((card) => {
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  card.addEventListener('pointerdown', (e) => {
    // Static layout on small screens — no dragging
    if (window.matchMedia('(max-width: 860px)').matches) return;

    card.setPointerCapture(e.pointerId);
    card.classList.add('dragging');
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;

    const move = (ev) => {
      offsetX = ev.clientX - startX;
      offsetY = ev.clientY - startY;
      card.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(var(--r))`;
    };

    const up = (ev) => {
      card.classList.remove('dragging');
      card.releasePointerCapture(ev.pointerId);
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerup', up);
    };

    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up);
  });
});

// Sparkle cursor with trailing sparks (pointer devices only)
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const starSVG = (size, color) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z" fill="${color}"/>
    </svg>`;

  const cursor = document.createElement('div');
  cursor.className = 'cursor-sparkle is-hidden';
  cursor.innerHTML = starSVG(28, '#3373bd');
  document.body.appendChild(cursor);

  const sparkColors = ['#3373bd', '#cae0fa', '#022161', '#8db8e8'];
  let lastSpark = 0;

  document.addEventListener('pointermove', (e) => {
    cursor.classList.remove('is-hidden');
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';

    const interactive = e.target instanceof Element && e.target.closest('a, button, .drag-card');
    cursor.classList.toggle('is-active', !!interactive);

    const now = performance.now();
    if (now - lastSpark < 40) return;
    lastSpark = now;

    const spark = document.createElement('div');
    spark.className = 'cursor-spark';
    const size = 6 + Math.random() * 8;
    spark.innerHTML = starSVG(size, sparkColors[Math.floor(Math.random() * sparkColors.length)]);
    spark.style.left = e.clientX + (Math.random() - 0.5) * 14 + 'px';
    spark.style.top = e.clientY + (Math.random() - 0.5) * 14 + 'px';
    spark.style.setProperty('--dx', (Math.random() - 0.5) * 50 + 'px');
    spark.style.setProperty('--dy', 10 + Math.random() * 30 + 'px');
    spark.addEventListener('animationend', () => spark.remove());
    document.body.appendChild(spark);
  });

  document.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
}

// Mobile nav toggle
const nav = document.querySelector('.nav');
document.querySelector('.nav-toggle').addEventListener('click', () => {
  nav.classList.toggle('open');
});
nav.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => nav.classList.remove('open'));
});
