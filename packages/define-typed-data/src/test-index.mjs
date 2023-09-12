import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { compile } from './interface-keys-transformer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

compile([join(__dirname, './test.ts')]);
