import fs from 'node:fs';

const sql = fs.readFileSync('schema/init.sql', 'utf8') + '\n' +
            fs.readFileSync('scripts/seed-local-d1.sql', 'utf8') + '\n' +
            fs.readFileSync('scripts/seed-topics.sql', 'utf8');

const statements = sql
  .split(/;\s*$/m)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

fs.writeFileSync('/tmp/statements.json', JSON.stringify(statements));
console.log('Total statements to execute:', statements.length);
