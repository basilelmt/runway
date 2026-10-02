import { Link } from 'react-router';
import { EmptyState } from '@/components/ui';

export function NotFoundPage() {
  return <EmptyState title="Page introuvable" description="Cette adresse ne correspond à aucun écran." action={<Link to="/">Retour au tableau de bord</Link>} />;
}
