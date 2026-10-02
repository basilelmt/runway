import { FileUp } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui';
import styles from './DropZone.module.css';

type DropZoneProps = {
  onFile: (file: File) => void;
  busy?: boolean;
};

/** Zone de dépôt du relevé CSV : glisser-déposer ou sélection classique. */
export function DropZone({ onFile, busy = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const inputId = useId();

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={[styles.zone, over ? styles.over : '', busy ? styles.busy : ''].join(' ')}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={busy ? undefined : handleDrop}
    >
      <div className={styles.icon} aria-hidden>
        {busy ? <span className={styles.spinner} /> : <FileUp />}
      </div>
      <p className={styles.title}>{busy ? 'Lecture du relevé' : "Dépose ici l'export CSV de La Banque Postale"}</p>
      <p className={styles.hint}>Depuis ton espace client : Comptes, Télécharger les opérations, format CSV.</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
        Choisir un fichier
      </Button>
    </div>
  );
}
