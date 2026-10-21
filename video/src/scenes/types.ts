import type { ReactNode } from 'react';
import type { Entrance } from '../components/Motion';

/** Un plan du montage : sa durée, son entrée, et un éclair jaune facultatif sur la coupe. */
export type ShotDef = { frames: number; entrance?: Entrance; flash?: boolean; node: ReactNode };
