import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Notice.module.css';

type NoticeProps = {
  tone?: 'marking' | 'negative' | 'warning' | 'neutral';
  /** `null` retire l'icône par défaut des tons négatif et attention. */
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  /** Nom du groupe (bandeau avec actions). */
  label?: string;
};

/** Le seul bandeau de l'app : proposition, erreur, mise en garde ou note. */
export function Notice({ tone = 'neutral', icon, children, action, label }: NoticeProps) {
  const shownIcon = icon === undefined ? (tone === 'negative' || tone === 'warning' ? <AlertCircle /> : null) : icon;
  const role = tone === 'negative' ? 'alert' : label ? 'group' : undefined;
  return (
    <div className={[styles.notice, styles[tone]].join(' ')} role={role} aria-label={role === 'group' ? label : undefined}>
      {shownIcon ? (
        <span className={styles.icon} aria-hidden>
          {shownIcon}
        </span>
      ) : null}
      <div className={styles.text}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
