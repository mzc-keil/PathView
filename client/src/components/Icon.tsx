import type { CSSProperties, ReactElement } from 'react';

export type IconName =
  | 'play'
  | 'pause'
  | 'stepBack'
  | 'stepFwd'
  | 'skipStart'
  | 'skipEnd'
  | 'loop'
  | 'trash'
  | 'palette'
  | 'eye'
  | 'eyeOff'
  | 'download'
  | 'upload'
  | 'search'
  | 'close'
  | 'chevron'
  | 'target'
  | 'box'
  | 'ruler'
  | 'gun'
  | 'chart'
  | 'layers'
  | 'refresh'
  | 'grid'
  | 'help'
  | 'keyboard'
  | 'warn'
  | 'check'
  | 'info'
  | 'focus'
  | 'diff'
  | 'speed';

const FILLED = new Set<IconName>(['play', 'stepBack', 'stepFwd', 'skipStart', 'skipEnd']);

const PATHS: Record<IconName, ReactElement> = {
  play: <path d="M7 4.6v14.8L19.5 12z" />,
  pause: <path d="M9 5v14M15 5v14" strokeWidth={3} />,
  stepBack: <path d="M18.5 4.6v14.8L6 12z" />,
  stepFwd: <path d="M5.5 4.6v14.8L18 12z" />,
  skipStart: <path d="M20.5 4.6v14.8L7 12z" />,
  skipEnd: <path d="M3.5 4.6v14.8L17 12z" />,
  loop: (
    <>
      <path d="M4 9a5 5 0 0 1 5-5h10" />
      <path d="M16.5 1.5 19.5 4l-3 2.5" />
      <path d="M20 15a5 5 0 0 1-5 5H5" />
      <path d="M7.5 22.5 4.5 20l3-2.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.8h5V7" />
      <path d="M6.5 7l1 12.5h9L17.5 7" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.6 1.3-1.7 2.3-1.7h1.4A3.5 3.5 0 0 0 21 14c0-6-4-11-9-11z" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  eye: (
    <>
      <path d="M2.2 12S6 6 12 6s9.8 6 9.8 6-3.8 6-9.8 6-9.8-6-9.8-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4.5 4.5l15 15" />
      <path d="M9.6 6.5A9 9 0 0 1 12 6c6 0 9.8 6 9.8 6a17 17 0 0 1-3 3.6" />
      <path d="M6.7 8.2A17 17 0 0 0 2.2 12S6 18 12 18a9.4 9.4 0 0 0 3.3-.6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v12M7 10.5l5 5 5-5" />
      <path d="M4 20.5h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 18V6M7 11l5-5 5 5" />
      <path d="M4 20.5h16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.8 15.8 21 21" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5" />
    </>
  ),
  box: <path d="M3.5 5.5h17v13h-17z" strokeDasharray="3.5 2.5" />,
  ruler: (
    <>
      <path d="M2.5 8.5h19v7h-19z" />
      <path d="M7 8.5v3M11 8.5v3M15 8.5v3M19 8.5v3" />
    </>
  ),
  gun: (
    <>
      <path d="M2.5 10.5h9.5l4 1.5-4 1.5H2.5z" />
      <path d="M16 12h5.5" />
      <path d="M6 13.5V19h3.5v-4" />
    </>
  ),
  chart: <path d="M3 20.5V9M9 20.5V4M15 20.5V13M21 20.5H2.5" />,
  layers: (
    <>
      <path d="M12 3l8.5 4.5L12 12 3.5 7.5z" />
      <path d="M3.5 13L12 17.5 20.5 13" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 3.5v5h-5" />
    </>
  ),
  grid: <path d="M3.5 3.5h17v17h-17zM3.5 9.2h17M3.5 14.9h17M9.2 3.5v17M14.9 3.5v17" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.7.3-1.2 1-1.2 1.8v.4" />
      <circle cx="11.8" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <path d="M6 10.5h.01M10 10.5h.01M14 10.5h.01M18 10.5h.01M8.5 14h7" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3.5 21 19.5H3z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8.2" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  focus: (
    <>
      <path d="M3.5 8.5v-5h5M20.5 8.5v-5h-5M3.5 15.5v5h5M20.5 15.5v5h-5" />
      <circle cx="12" cy="12" r="2.2" />
    </>
  ),
  diff: (
    <>
      <path d="M4 4v16M20 4v16" />
      <path d="M4 9h7M13 15h7" />
      <path d="M13 9h7M4 15h7" strokeDasharray="2.5 2" />
    </>
  ),
  speed: (
    <>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 17l4.2-6" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, className, style }: IconProps) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
