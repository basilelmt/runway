import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './PageHeader.module.css';

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  /** Petite ligne au-dessus du titre (la date sur l'accueil). */
  eyebrow?: ReactNode;
  /** Page fille : lien vers la page parente, au-dessus du titre. */
  back?: { to: string; label: string };
  /** Une seule action, en bouton secondaire. */
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, eyebrow, back, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {back ? (
          <Link to={back.to} className={styles.back}>
            <ArrowLeft aria-hidden />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
