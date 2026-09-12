# Tasks: Multi-Project / Multi-Brand AI Content Platform

- [x] 1. Audit repository structure, dependencies, and database schema.
- [x] 2. Initialize OpenSpec change proposal, design, and specs.
- [x] 3. Update D1 schema (`schema/init.sql`) additively with multi-project tables & columns.
- [x] 4. Run `node scripts/bundle-schema.js` to refresh `functions/_lib/schema.js`.
- [x] 5. Implement Project & Brand management helper library (`functions/_lib/projects.js`).
- [x] 6. Implement AI Provider Abstraction layer (`functions/_lib/ai/provider.js`).
- [x] 7. Implement Publisher Abstraction layer (`functions/_lib/publishing/publisher.js`).
- [x] 8. Implement Topic Discovery Engine (`functions/_lib/project_topics.js`).
- [x] 9. Update Blog multi-step pipeline (`start.js`, `text.js`, `image.js`, `publish.js`) to support `project_id`.
- [x] 10. Implement Admin API endpoints:
  - `functions/api/admin/projects.js`
  - `functions/api/admin/projects/[id].js`
  - `functions/api/admin/topics.js`
  - `functions/api/admin/cron/tick.js`
- [x] 11. Create seed script / migration for Gulagi and GuRouter projects.
- [x] 12. Create test suite verifying project isolation, AI provider abstraction, topic generation, and publishing abstraction.
- [x] 13. Run tests and document verification results.
