import { lbpParser } from './lbp';
import type { BankParser } from './types';

export const parsers: BankParser[] = [lbpParser];

export function detectParser(buffer: Buffer): BankParser | null {
  return parsers.find((p) => p.detect(buffer)) ?? null;
}

export type { BankParser, ParsedRow, ParsedStatement } from './types';
