import type { InputHTMLAttributes } from 'react';
import styles from './Range.module.css';

/** Curseur partagé, stylé de manière homogène. */
export function Range({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="range" className={[styles.range, className ?? ''].join(' ')} {...rest} />;
}
