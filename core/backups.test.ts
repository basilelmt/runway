import { describe, expect, it } from 'vitest';
import { backupsToDelete, formatBackupFilename, kebabCase, parseBackupFilename, reasonLabel } from './backups';

describe('nommage des fichiers', () => {
  it('formate puis relit le même nom', () => {
    const date = new Date(2026, 9, 10, 8, 0, 0);
    const name = formatBackupFilename(date, 'demarrage');
    expect(name).toBe('runway-2026-10-10T08-00-00-demarrage.db');
    expect(parseBackupFilename(name)).toEqual({ date, reason: 'demarrage' });
  });

  it("garde une raison personnalisée avec des tirets, comme celle d'un déclenchement manuel", () => {
    const date = new Date(2026, 9, 8, 23, 13, 5);
    const name = formatBackupFilename(date, 'avant-remise-a-zero');
    expect(name).toBe('runway-2026-10-08T23-13-05-avant-remise-a-zero.db');
    expect(parseBackupFilename(name)).toEqual({ date, reason: 'avant-remise-a-zero' });
  });

  it("renvoie null pour un nom qui ne suit pas le format (ancienne copie manuelle)", () => {
    expect(parseBackupFilename('runway-before-remise-a-zero-mensuelle-2026-10-08.db')).toBeNull();
    expect(parseBackupFilename('runway.db')).toBeNull();
  });
});

describe('kebab-case de la raison manuelle', () => {
  it('met en minuscules, retire les accents et remplace le bruit par des tirets', () => {
    expect(kebabCase('Avant remise à zéro mensuelle')).toBe('avant-remise-a-zero-mensuelle');
    expect(kebabCase('  Déjà-kebab  ')).toBe('deja-kebab');
  });

  it('retombe sur « manuelle » si la raison est vide une fois nettoyée', () => {
    expect(kebabCase('   ')).toBe('manuelle');
    expect(kebabCase('!!!')).toBe('manuelle');
  });
});

describe('raison en clair', () => {
  it('traduit les cinq déclencheurs connus', () => {
    expect(reasonLabel('demarrage')).toBe('Au démarrage');
    expect(reasonLabel('avant-migration')).toBe('Avant une migration');
    expect(reasonLabel('quotidienne')).toBe('Quotidienne');
    expect(reasonLabel('manuelle')).toBe('Manuelle');
    expect(reasonLabel('avant-restauration')).toBe('Avant une restauration');
  });

  it('affiche une raison inconnue telle quelle', () => {
    expect(reasonLabel('avant-remise-a-zero')).toBe('avant-remise-a-zero');
  });
});

describe('règle de conservation', () => {
  const now = new Date(2026, 9, 10, 12, 0, 0);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it('garde tout ce qui a moins de 30 jours', () => {
    const entries = [
      { name: 'a', date: daysAgo(0), reason: 'quotidienne' },
      { name: 'b', date: daysAgo(29), reason: 'quotidienne' },
      { name: 'c', date: daysAgo(29.9), reason: 'demarrage' },
    ];
    expect(backupsToDelete(entries, now)).toEqual([]);
  });

  it("au-delà de 30 jours, ne garde que la plus récente du mois calendaire", () => {
    const entries = [
      { name: 'ancienne-1', date: new Date(2026, 7, 2, 8, 0, 0), reason: 'quotidienne' },
      { name: 'ancienne-2', date: new Date(2026, 7, 15, 8, 0, 0), reason: 'quotidienne' },
      // La plus récente du mois d'août : gardée.
      { name: 'ancienne-3', date: new Date(2026, 7, 28, 8, 0, 0), reason: 'quotidienne' },
      { name: 'septembre-seule', date: new Date(2026, 8, 5, 8, 0, 0), reason: 'demarrage' },
    ];
    expect(backupsToDelete(entries, now).sort()).toEqual(['ancienne-1', 'ancienne-2']);
  });

  it('ne supprime jamais une raison manuelle, de restauration ou personnalisée, même ancienne', () => {
    const entries = [
      { name: 'manuelle', date: daysAgo(400), reason: 'manuelle' },
      { name: 'restauration', date: daysAgo(400), reason: 'avant-restauration' },
      { name: 'perso', date: daysAgo(400), reason: 'avant-remise-a-zero' },
      { name: 'ancienne-copie', date: daysAgo(400), reason: 'manuelle' },
    ];
    expect(backupsToDelete(entries, now)).toEqual([]);
  });

  it('plusieurs sauvegardes le même jour ancien : une seule reste (celle du mois)', () => {
    const entries = [
      { name: 'matin', date: new Date(2026, 7, 2, 8, 0, 0), reason: 'quotidienne' },
      { name: 'soir', date: new Date(2026, 7, 2, 20, 0, 0), reason: 'quotidienne' },
    ];
    expect(backupsToDelete(entries, now)).toEqual(['matin']);
  });
});
