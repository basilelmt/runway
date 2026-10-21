import { color } from '../theme';

/** Le logo de l'app (client/public/favicon.svg) : une piste sombre et ses deux bandes jaunes. */
export function BrandMark({ size, outline = false }: { size: number; outline?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <clipPath id="brand-piste">
        <rect width="100" height="100" rx="25" />
      </clipPath>
      <g clipPath="url(#brand-piste)">
        <rect width="100" height="100" fill={color.tarmac} />
        <rect x="36" width="10" height="100" fill={color.marking} />
        <rect x="54" width="10" height="100" fill={color.marking} />
      </g>
      {outline ? <rect x="1.5" y="1.5" width="97" height="97" rx="23.5" fill="none" stroke={color.paper} strokeOpacity="0.14" strokeWidth="3" /> : null}
    </svg>
  );
}

/** L'avion de la piste de prévision (icône Plane de lucide, licence ISC), tourné pour rouler vers la droite. */
export function Plane({ size, stroke = color.tarmacInk, fill = color.tarmac }: { size: number; stroke?: string; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', transform: 'rotate(45deg)' }}>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
  );
}
