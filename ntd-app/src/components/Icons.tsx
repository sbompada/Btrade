type Props = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 20 20',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

const base16 = (size: number) => ({ ...base(size), viewBox: '0 0 16 16', strokeWidth: 1.4 });

export const Logo = ({ size = 19 }: Props) => (
  <svg {...base(size)} strokeWidth={1.7} style={{ color: 'var(--amber)' }}>
    <path d="M2.5 4 L10 17 L17.5 4" />
    <path d="M6.6 4 L10 10 L13.4 4" />
  </svg>
);

export const Cart = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 4h2l1.8 9h8.4L17 7H6" />
    <circle cx="8" cy="16" r="1.1" />
    <circle cx="15" cy="16" r="1.1" />
  </svg>
);

export const Bell = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5.5-1.5 5.5h12s-1.5-1.5-1.5-5.5A4.5 4.5 0 0 0 10 3z" />
    <path d="M8.6 16a1.6 1.6 0 0 0 2.8 0" />
  </svg>
);

export const Search = ({ size = 13 }: Props) => (
  <svg {...base16(size)} strokeWidth={1.5}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.4 10.4 L14 14" />
  </svg>
);

export const Chevron = ({ size = 12, dir = 'down' }: Props & { dir?: 'up' | 'down' }) => (
  <svg {...base16(size)} strokeWidth={1.6}>
    {dir === 'up' ? <path d="M3.5 10 L8 5.5 L12.5 10" /> : <path d="M3.5 6 L8 10.5 L12.5 6" />}
  </svg>
);

export const Dots = ({ size = 12 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="3" r="1.2" />
    <circle cx="8" cy="8" r="1.2" />
    <circle cx="8" cy="13" r="1.2" />
  </svg>
);

export const Doc = ({ size = 12 }: Props) => (
  <svg {...base16(size)}>
    <path d="M4 1.8h5l3 3v9.4H4z" />
    <path d="M9 1.8v3h3" />
  </svg>
);

export const Clock = ({ size = 12 }: Props) => (
  <svg {...base16(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.6V8l2.3 1.6" />
  </svg>
);

export const Download = ({ size = 12 }: Props) => (
  <svg {...base16(size)}>
    <path d="M8 2.4v7.2" />
    <path d="M5.2 7 L8 9.8 L10.8 7" />
    <path d="M3 12.6h10" />
  </svg>
);

export const Bars = ({ size = 12 }: Props) => (
  <svg {...base16(size)}>
    <path d="M2.6 13.4V9" />
    <path d="M6.9 13.4V5" />
    <path d="M11.2 13.4V7" />
  </svg>
);

export const Gear = ({ size = 12 }: Props) => (
  <svg {...base16(size)}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8L3.5 3.5" />
  </svg>
);

export const Eye = ({ size = 15 }: Props) => (
  <svg {...base(size)} strokeWidth={1.4}>
    <path d="M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10z" />
    <circle cx="10" cy="10" r="2.3" />
  </svg>
);

export const User = ({ size = 14 }: Props) => (
  <svg {...base(size)} strokeWidth={1.4}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 17c0-3.2 2.8-5 6.2-5s6.2 1.8 6.2 5" />
  </svg>
);

export const Lock = ({ size = 14 }: Props) => (
  <svg {...base(size)} strokeWidth={1.4}>
    <rect x="4" y="8.6" width="12" height="8" rx="1.6" />
    <path d="M7 8.6V6.4a3 3 0 0 1 6 0v2.2" />
  </svg>
);

export const Shield = ({ size = 15 }: Props) => (
  <svg {...base(size)} style={{ color: 'var(--amber)' }}>
    <path d="M10 2.6 L16.5 6v5.2c0 3.4-2.7 5.4-6.5 6.2-3.8-.8-6.5-2.8-6.5-6.2V6z" />
    <path d="M7.6 10l1.7 1.7 3.3-3.4" />
  </svg>
);

export const Equity = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <path d="M2.4 12.4V7" />
    <path d="M6.6 12.4V3.6" />
    <path d="M10.8 12.4V8.6" />
    <path d="M1.4 14.4h13.2" />
  </svg>
);

export const Commodity = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <ellipse cx="8" cy="4.2" rx="5.2" ry="2.2" />
    <path d="M2.8 4.2v7.6c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V4.2" />
    <path d="M2.8 8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2" />
  </svg>
);

export const Pencil = ({ size = 13 }: Props) => (
  <svg {...base16(size)}>
    <path d="M11.2 2.4l2.4 2.4-8 8H3.2v-2.4z" />
  </svg>
);

export const Terminal = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" />
    <path d="M4.6 6.6l1.8 1.8-1.8 1.8" />
    <path d="M8.4 10.2h3" />
  </svg>
);

export const Rupee = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6 5h4" />
    <path d="M6 7.2h4" />
    <path d="M9.4 5c0 1.9-1.2 2.6-2.6 2.6L9.6 11" />
  </svg>
);

export const LifeBuoy = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.2 6.2a1.9 1.9 0 1 1 2.5 2.2c-.5.2-.7.6-.7 1.1" />
    <path d="M8 12.1v.01" />
  </svg>
);

export const UserPlus = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <circle cx="6.2" cy="6" r="2.4" />
    <path d="M1.8 13.2c0-2.2 2-3.4 4.4-3.4s4.4 1.2 4.4 3.4" />
    <path d="M12.2 5.2v3.4" />
    <path d="M13.9 6.9h-3.4" />
  </svg>
);

export const Keyboard = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <rect x="1.4" y="4" width="13.2" height="8" rx="1.4" />
    <path d="M4.2 6.6h.01M6.6 6.6h.01M9 6.6h.01M11.4 6.6h.01M4.9 9.4h6.2" />
  </svg>
);

export const Book = ({ size = 14 }: Props) => (
  <svg {...base16(size)}>
    <path d="M8 4.4c-1-1-2.4-1.6-4-1.6H2.2v9.4H4c1.6 0 3 .6 4 1.6" />
    <path d="M8 4.4c1-1 2.4-1.6 4-1.6h1.8v9.4H12c-1.6 0-3 .6-4 1.6z" />
  </svg>
);

export const Logout = ({ size = 14 }: Props) => (
  <svg {...base16(size)} style={{ color: 'var(--down)' }}>
    <path d="M6.2 13.4H3.4V2.6h2.8" />
    <path d="M9.8 10.8L12.6 8 9.8 5.2" />
    <path d="M12.6 8H6.4" />
  </svg>
);

export const Play = ({ size = 13 }: Props) => (
  <svg {...base16(size)} strokeLinecap="butt">
    <path d="M3 1.8 L12.6 8 L3 14.2 Z" />
  </svg>
);

export const Phone = ({ size = 13 }: Props) => (
  <svg {...base16(size)}>
    <rect x="4" y="1.5" width="8" height="13" rx="1.6" />
    <path d="M7 12.6h2" />
  </svg>
);
