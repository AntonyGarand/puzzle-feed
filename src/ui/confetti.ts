/** A short burst of neo-brutalist confetti (bordered palette squares) from a point on screen. */
export function confetti(originX = window.innerWidth / 2, originY = window.innerHeight / 3, count = 70) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  document.body.append(layer);
  const colors = ['--p1', '--p2', '--p3', '--p4', '--p5', '--p6', '--p7'];
  let longest = 0;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    const size = 7 + Math.random() * 9;
    bit.style.cssText = `left:${originX}px;top:${originY}px;width:${size}px;height:${size * (0.5 + Math.random())}px;background:var(${colors[i % colors.length]})`;
    layer.append(bit);
    const angle = Math.random() * Math.PI * 2;
    const speed = 160 + Math.random() * 320;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 220;
    const fall = 380 + Math.random() * 380;
    const duration = 1100 + Math.random() * 700;
    longest = Math.max(longest, duration);
    bit.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${180 + Math.random() * 360}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx * 1.25}px, ${dy + fall}px) rotate(${360 + Math.random() * 540}deg)`, opacity: 0 },
      ],
      { duration, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    );
  }
  setTimeout(() => layer.remove(), longest + 100);
}
