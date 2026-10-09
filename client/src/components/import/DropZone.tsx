import { FileUp } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import styles from './DropZone.module.css';

type DropZoneProps = {
  onFile: (file: File) => void;
  busy?: boolean;
};

/** Zone de dépôt du relevé (CSV ou PDF) : glisser-déposer ou sélection classique. */
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
      className={[styles.zone, over ? styles.over : ''].join(' ')}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={busy ? undefined : handleDrop}
    >
      <EmptyState
        icon={busy ? <Spinner size={20} /> : <FileUp />}
        title={busy ? 'Lecture du relevé' : 'Dépose ici un relevé La Banque Postale'}
        description="Export CSV des opérations, ou relevé mensuel PDF (tous les comptes du relevé sont lus)."
        action={
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choisir un fichier
          </Button>
        }
      />
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv,text/csv,.pdf,application/pdf"
        className="visually-hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
