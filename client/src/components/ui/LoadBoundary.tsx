import { Component, type ReactNode } from 'react';

type LoadBoundaryProps = { fallback: ReactNode; children: ReactNode };

/**
 * Isole un composant chargé à la demande : si son fichier ne se charge pas (nouvelle version
 * déployée, réseau coupé), seul ce morceau affiche `fallback`, le reste de l'app continue.
 */
export class LoadBoundary extends Component<LoadBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
