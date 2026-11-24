/**
 * An open notebook on its ring binding, a line of handwriting and a pen.
 * The shell's ad slot shows it until ads start (docs/adr/0007). Original
 * art, drawn with the shell's `app-ad-*` classes on ui's tokens, so it
 * follows the brand and light or dark mode. Decorative: the slot is hidden
 * from assistive technology.
 */
export function AdArt() {
  return (
    <svg
      viewBox="0 0 160 520"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="app-ad-soft"
        x="40"
        y="70"
        width="96"
        height="128"
        rx="6"
        transform="rotate(6 88 134)"
      />
      <rect className="app-ad-paper" x="28" y="214" width="104" height="164" rx="6" />
      <rect className="app-ad-line" x="28" y="214" width="104" height="164" rx="6" />
      <rect className="app-ad-accent" x="28" y="214" width="14" height="164" rx="6" />
      <circle className="app-ad-paper" cx="35" cy="236" r="3" />
      <circle className="app-ad-paper" cx="35" cy="262" r="3" />
      <circle className="app-ad-paper" cx="35" cy="288" r="3" />
      <circle className="app-ad-paper" cx="35" cy="314" r="3" />
      <circle className="app-ad-paper" cx="35" cy="340" r="3" />
      <rect className="app-ad-ink" x="52" y="246" width="68" height="2" rx="1" opacity="0.35" />
      <rect className="app-ad-ink" x="52" y="270" width="68" height="2" rx="1" opacity="0.35" />
      <rect className="app-ad-ink" x="52" y="294" width="68" height="2" rx="1" opacity="0.35" />
      <rect className="app-ad-ink" x="52" y="318" width="68" height="2" rx="1" opacity="0.35" />
      <rect className="app-ad-ink" x="52" y="342" width="68" height="2" rx="1" opacity="0.35" />
      <path
        className="app-ad-line"
        d="M54 262 c6 -10 10 -10 12 0 s6 10 10 0 s8 -10 12 0 s6 8 12 -2"
      />
      <path className="app-ad-line" d="M54 286 c8 -6 16 4 24 -2 s10 -4 14 2" />
      <path className="app-ad-accent" d="M104 300 l22 -22 l6 6 l-22 22 l-9 3 Z" />
      <path className="app-ad-paper" d="M101 309 l3 -9 l6 6 Z" />
      <rect className="app-ad-accent" x="52" y="420" width="56" height="24" rx="12" />
      <path className="app-ad-paper" d="M72 432 l6 6 l12 -12 l-2 -2 l-10 10 l-4 -4 Z" />
    </svg>
  );
}
