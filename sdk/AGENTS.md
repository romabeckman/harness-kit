# RULES

- NEVER run `git push`, `git branch`, `git add`, `git commit`, `git restore` or `git checkout` commands (strictly forbidden)
- ALWAYS start by reading `docs/.digest.md` and `docs/.graph.json`
- ALWAYS run `npm install` to check dependencies
- ALWAYS run `npm run build` before `npm run typecheck`
- ALWAYS run `npm run typecheck` before `npm run test`
- ALWAYS use Portuguese in your answers and write code and documentation (comments, docstrings, etc.) in English
- ALWAYS verify if `OpenApiSpecGenerator.ts` is updated after changes in `src/server` with endpoint changes.