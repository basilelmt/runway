import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet' | 'marking' | 'text';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[styles.button, styles[variant], styles[size], icon && !children ? styles.iconOnly : '', loading ? styles.loading : '', className ?? ''].join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <span className={styles.icon}>{icon}</span> : null}
      {children}
    </button>
  );
});

type ButtonLinkProps = LinkProps & Pick<ButtonProps, 'variant' | 'size' | 'icon'>;

/** Lien de navigation avec l'apparence d'un bouton. */
export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={[styles.button, styles.link, styles[variant], styles[size], icon && !children ? styles.iconOnly : '', className ?? ''].join(' ')} {...rest}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {children}
    </Link>
  );
}
