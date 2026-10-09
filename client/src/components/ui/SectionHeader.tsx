import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Amount } from './Amount';
import styles from './SectionHeader.module.css';

type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Un seul élément à droite : SectionLink, Total, bouton secondaire sm ou contrôles sm. */
  aside?: ReactNode;
  as?: 'h2' | 'h3';
  /** Posé sur le titre, pour `aria-labelledby` de la section. */
  id?: string;
};

export function SectionHeader({ title, description, aside, as: Heading = 'h2', id }: SectionHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <Heading id={id} className={Heading === 'h2' ? styles.title : styles.titleSmall}>
          {title}
        </Heading>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </div>
  );
}

/** Lien « voir tout » d'un en-tête de section. */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.link}>
      {children}
      <ArrowRight aria-hidden />
    </Link>
  );
}

/** Total discret à droite d'un titre. */
export function Total({ label = 'Total', cents }: { label?: string; cents: number }) {
  return (
    <span className={styles.total}>
      {label} <Amount cents={cents} tone="neutral" className={styles.totalAmount} />
    </span>
  );
}
