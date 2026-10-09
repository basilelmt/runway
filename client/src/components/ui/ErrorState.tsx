import { AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

type ErrorStateProps = { title: string; description?: string; onRetry?: () => void };

/** Échec de chargement d'une page ou d'une section : partout le même message et « Réessayer ». */
export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      tone="negative"
      icon={<AlertCircle />}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Réessayer
          </Button>
        ) : undefined
      }
    />
  );
}
