import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import styles from './Input.module.css';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={[styles.input, className ?? ''].join(' ')} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={[styles.input, styles.select, className ?? ''].join(' ')} {...rest} />;
});

export const DateInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function DateInput(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});
