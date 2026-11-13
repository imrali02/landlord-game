// Simplified SVG flags (Windows does not render flag emoji).
import type { CountryId } from '../../shared/types';

const star = (cx: number, cy: number, R: number, rot = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? R : R * 0.382;
    const a = ((rot + i * 36) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
};

function Shapes({ country }: { country: CountryId }) {
  switch (country) {
    case 'palestine':
      return (
        <>
          <rect width="30" height="6.67" fill="#000" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <rect y="13.33" width="30" height="6.67" fill="#007a3d" />
          <polygon points="0,0 11,10 0,20" fill="#ce1126" />
        </>
      );
    case 'pakistan':
      return (
        <>
          <rect width="30" height="20" fill="#01411c" />
          <rect width="7.5" height="20" fill="#fff" />
          <circle cx="19" cy="10" r="5.6" fill="#fff" />
          <circle cx="20.6" cy="8.6" r="4.8" fill="#01411c" />
          <polygon points={star(22.6, 7.2, 1.9, -50)} fill="#fff" />
        </>
      );
    case 'italy':
      return (
        <>
          <rect width="10" height="20" fill="#009246" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ce2b37" />
        </>
      );
    case 'germany':
      return (
        <>
          <rect width="30" height="6.67" fill="#000" />
          <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
          <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
        </>
      );
    case 'china':
      return (
        <>
          <rect width="30" height="20" fill="#ee1c25" />
          <polygon points={star(5, 5, 3)} fill="#ffde00" />
          <polygon points={star(10, 2, 1)} fill="#ffde00" />
          <polygon points={star(12, 4, 1)} fill="#ffde00" />
          <polygon points={star(12, 7, 1)} fill="#ffde00" />
          <polygon points={star(10, 9, 1)} fill="#ffde00" />
        </>
      );
    case 'france':
      return (
        <>
          <rect width="10" height="20" fill="#0055a4" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ef4135" />
        </>
      );
    case 'uk':
      return (
        <>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0,0 30,20 M30,0 0,20" stroke="#fff" strokeWidth="4" />
          <path d="M0,0 30,20 M30,0 0,20" stroke="#c8102e" strokeWidth="1.4" />
          <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="6" />
          <path d="M15,0 V20 M0,10 H30" stroke="#c8102e" strokeWidth="3.4" />
        </>
      );
    case 'usa':
      return (
        <>
          {Array.from({ length: 13 }, (_, i) => (
            <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13 + 0.05} fill={i % 2 ? '#fff' : '#b22234'} />
          ))}
          <rect width="12" height={(20 / 13) * 7} fill="#3c3b6e" />
          {Array.from({ length: 12 }, (_, i) => (
            <circle key={i} cx={1.5 + (i % 4) * 3} cy={1.6 + Math.floor(i / 4) * 3.4} r="0.55" fill="#fff" />
          ))}
        </>
      );
  }
}

export function Flag({ country, width = 24, className }: { country: CountryId; width?: number; className?: string }) {
  return (
    <svg
      className={`flag ${className ?? ''}`}
      viewBox="0 0 30 20"
      width={width}
      height={(width * 2) / 3}
      role="img"
      aria-label={country}
      preserveAspectRatio="none"
    >
      <Shapes country={country} />
    </svg>
  );
}
