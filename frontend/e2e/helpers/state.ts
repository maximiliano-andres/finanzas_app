import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from './env';
import type { E2EState } from '../global-setup';
export const state = (): E2EState => JSON.parse(readFileSync(join(OUT, 'state.json'), 'utf8'));
export const storage = (key: string) => join(OUT, `${key}.json`);
