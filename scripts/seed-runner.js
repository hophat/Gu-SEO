import { createMockEnv } from './mock-env.js';
import { seedProjects } from './seed-projects.js';

async function main() {
  console.log('Seeding default projects (Gulagi & GuRouter)...');
  const env = createMockEnv();
  const res = await seedProjects(env);
  console.log('Seeded successfully:');
  console.log('1.', res.gulagi.slug, `(${res.gulagi.name}) ->`, res.gulagi.publishing_url);
  console.log('2.', res.gurouter.slug, `(${res.gurouter.name}) ->`, res.gurouter.publishing_url);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
