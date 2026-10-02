import type { ISODate } from '@shared/dates';

export type ParsedRow = {
  date: ISODate;
  label: string;
  /** Centimes signés : négatif pour un débit. */
  signedAmount: number;
};

export type ParsedStatement = {
  bankAccountNumber: string | null;
  /** Solde annoncé par la banque, en centimes, si présent dans l'en-tête. */
  statedBalance: number | null;
  rows: ParsedRow[];
};

export interface BankParser {
  id: string;
  name: string;
  detect(buffer: Buffer): boolean;
  parse(buffer: Buffer): ParsedStatement;
}
