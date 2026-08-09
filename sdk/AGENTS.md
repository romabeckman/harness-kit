# RULES

- NEVER run `git push`, `git branch`, `git add`, `git commit`, `git restore` or `git checkout` commands (strictly forbidden)

# RULES for code change and development do:
- ALWAYS start by reading `docs/.digest.md` and `docs/.graph.json`
- ALWAYS run `rtk npm install` to check dependencies
- ALWAYS run `rtk npm run lint` to check code syntax
- ALWAYS run `rtk npm run build` before `npm run typecheck`
- ALWAYS run `rtk npm run typecheck` before `npm run test`
- ALWAYS verify if `OpenApiSpecGenerator.ts` is updated after changes in `src/server` with endpoint changes.