#!/usr/bin/env bash
# One-time setup of the branches and protection rules PIPELINE.md relies on. Run by the repo owner, with an admin `gh login`:
#   bash tools/setup-github.sh
# Safe to repeat. Needs: gh, and the CI workflow already merged to main (so the check names exist).
set -euo pipefail
REPO=axeldinh/tingshuo
git fetch origin main
git ls-remote --exit-code --heads origin dev >/dev/null 2>&1 || git push origin origin/main:refs/heads/dev   # dev starts equal to main

protect() { # branch, required checks (JSON array), must the branch be up to date before merging
  gh api -X PUT "repos/$REPO/branches/$1/protection" --input - <<JSON
{ "required_status_checks": { "strict": $3, "contexts": $2 },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "restrictions": null, "allow_force_pushes": false, "allow_deletions": false,
  "required_linear_history": false, "required_conversation_resolution": true }
JSON
}
protect dev  '["verify"]'              false   # not strict: every merged feature would force all others to rebuild docs/. The release PR re-checks dev as a whole.
protect main '["verify","promotion"]'  true
# merge methods: squash and merge commits allowed (squash for features into dev, merge commit for dev -> main), no rebase, delete merged branches
gh api -X PATCH "repos/$REPO" -f allow_squash_merge=true -f allow_merge_commit=true -f allow_rebase_merge=false -F delete_branch_on_merge=true >/dev/null
gh api -X PATCH "repos/$REPO" -f default_branch=dev >/dev/null   # new PRs target dev by default
echo "done. GitHub Pages must keep serving branch main, folder /docs (Settings → Pages)."
