import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono';
import { loadFont as loadBody } from '@remotion/google-fonts/InstrumentSans';
import { Easing } from 'remotion';

/** Couleurs reprises de client/src/styles/tokens.css (mode clair). */
export const color = {
  paper: '#eef2ef',
  paperRaised: '#f7f9f7',
  paperSunken: '#e3e9e5',
  ink: '#14201c',
  inkSoft: '#3f4c47',
  inkMute: '#76827d',
  rule: '#cfd8d2',
  marking: '#e8b931',
  markingSoft: '#f6e6a8',
  markingOn: '#2b2000',
  negative: '#c8412b',
  positive: '#2f7d5b',
  tarmac: '#14201c',
  tarmacInk: '#eef2ef',
  night: '#030408',
  nightInk: '#f2efe8',
  nightInkSoft: '#cfcac1',
  nightPositive: '#5fc08f',
} as const;

export const font = {
  display: loadDisplay('normal', { weights: ['500', '600', '700'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  body: loadBody('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  mono: loadMono('normal', { weights: ['400', '500'], subsets: ['latin', 'latin-ext'] }).fontFamily,
};

export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;

/** Courbe des mouvements de caméra : départ et arrivée doux, comme `--ease-out` de l'app sur les deux bouts. */
export const camEase = Easing.bezier(0.65, 0, 0.35, 1);
/** Apparitions : la courbe `--ease-out` de l'app. */
export const outEase = Easing.bezier(0.2, 0.8, 0.2, 1);
