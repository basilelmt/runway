import styles from './Skeleton.module.css';

export function Skeleton({ width = '100%', height = 16, className }: { width?: number | string; height?: number; className?: string }) {
  return <span className={[styles.skeleton, className ?? ''].join(' ')} style={{ width, height }} aria-hidden />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className={styles.rows}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={40} />
      ))}
    </div>
  );
}
