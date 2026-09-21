# Loop Run Log

Append-only log of loop executions with timestamps and outcomes.

## Format
```
[YYYY-MM-DD HH:MM:SS UTC] {pattern-name} - {status} - {details}
```

## Log Entries

[2026-09-21 08:51:09 UTC] manual-fix (ad-hoc, user-requested) - success + merged (b54c309) - Carousel lifecycle after the publish fix: delete.js lists the carousel prefix and removes only <prefix>-N.png slides (a bare-prefix list also matched a neighbouring slug's slides — caught by exercising); list.js strips the carousel sentinel in the blog_posts join so rows show the article title, and drops the dead isCarousel var. Built in a Loop worktree loop/fix-20260921154352: npm test 154 checks pass + build:functions compiled, ff-merged to main, worktree/branch removed. Flipped loop-constraints.md to mode: auto-fix; scripts/loop-run.sh now ff-merges an APPROVEd fix and logs to loop-run-log.md + STATE.md.

[2026-09-21 08:58:19 UTC] manual-config (ad-hoc, user-requested) - success - Added `autofix --dry-run` (or `LOOP_DRY_RUN=1`) to scripts/loop-run.sh: runs implementer + verifier + `npm test` + `build:functions`, prints the diff, logs the run, and leaves the `loop/fix-*` branch + worktree for a human — never merges (every keep-for-human exit prints the diff too). Testing it surfaced two blockers in the runner: `pause_check` grepped the literal `loop-pause-all`, so STATE.md's prose mention armed the kill switch and EVERY run exited immediately; and `mktemp /tmp/loop-diff.XXXXXX.patch` (X's not trailing) returned a literal path that collided on the next run — now `${TMPDIR:-/tmp}/loop-diff.XXXXXX`. Verified end-to-end with a stub `opencode`: dry-run left main unchanged at b54c309, kept the branch/worktree, and logged a dry-run row.

[2026-09-21 09:40:53 UTC] manual-feature (ad-hoc, user-requested) - success + merged + deployed (9efe1e7, 51035e6) - Carousel tách khỏi trang Video thành trang riêng `#carousel` (nhóm Bài viết): chọn bài viết bằng dropdown có tìm kiếm thay vì gõ slug, hướng dẫn 4 bước, nhãn vai trò từng slide (Bìa/Ý/Kêu gọi), xem trước cả bộ 5 slide, tự làm mới khi agent đang render. Files: src/admin/pages/Carousel.jsx (mới), src/admin/App.jsx (menu + route), src/admin/pages/Video.jsx (gỡ carousel, lọc kind !== 'carousel', dọn dead code). Kèm 51035e6: timeout guard cho opencode trong loop-run.sh (LOOP_AGENT_TIMEOUT) + seed issue thật vào issue-triage-state.md. `npm run admin:build` OK. Pushed main, deployed Pages https://e6042544.gu-seo.pages.dev (cron-worker không đổi). Verified live: main.js trỏ Carousel-B--e-QvJ.js và chunk chứa copy mới (HTTP 200).