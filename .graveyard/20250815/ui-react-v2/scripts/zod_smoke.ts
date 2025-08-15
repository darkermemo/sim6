import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';

import { FieldsIn, EnumsIn, SearchCompileRes, SearchExecuteRes, Grammar } from '../src/lib/schemas';

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as unknown;
}

function check(name: string, schema: z.ZodTypeAny, value: unknown) {
  const res = schema.safeParse(value);
  if (!res.success) {
    console.error(`❌ ${name} failed:`);
    for (const issue of res.error.issues) {
      console.error(`  - ${issue.path.join('.')} ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`✅ ${name} ok`);
  }
}

const base = path.resolve(process.cwd(), '../../target/zod');

check('FieldsIn',        FieldsIn,        readJSON(path.join(base, 'fields.json')));
check('EnumsIn',         EnumsIn,         readJSON(path.join(base, 'enums.json')));
check('CompileResponse', SearchCompileRes, readJSON(path.join(base, 'compile.json')));
check('ExecuteResponse', SearchExecuteRes, readJSON(path.join(base, 'execute.json')));

const grammarPath = path.join(base, 'grammar.json');
if (fs.existsSync(grammarPath)) {
  check('Grammar', Grammar, readJSON(grammarPath));
} else {
  console.log('ℹ️ Grammar skipped (no sample present).');
}


