#!/bin/sh
set -e

echo "[BOOTSTRAP] Configuring Git environment..."
git config --global user.name "${GIT_COMMIT_AUTHOR_NAME:-HRNS Automation}"
git config --global user.email "${GIT_COMMIT_AUTHOR_EMAIL:-automation@hrns.local}"
git config --global init.defaultBranch main

# 1. Configure SSH credentials if provided via environment variable or mounted volume
if [ -n "$GIT_SSH_PRIVATE_KEY" ]; then
    echo "[BOOTSTRAP] Configuring SSH private key from GIT_SSH_PRIVATE_KEY environment variable..."
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh
    echo "$GIT_SSH_PRIVATE_KEY" > /root/.ssh/id_ed25519
    chmod 600 /root/.ssh/id_ed25519
    ssh-keyscan github.com gitlab.com bitbucket.org >> /root/.ssh/known_hosts 2>/dev/null || true
elif [ -f /root/.ssh/id_ed25519 ]; then
    echo "[BOOTSTRAP] Configuring volume-mounted SSH private key..."
    chmod 700 /root/.ssh
    chmod 600 /root/.ssh/id_ed25519
    ssh-keyscan github.com gitlab.com bitbucket.org >> /root/.ssh/known_hosts 2>/dev/null || true
fi

# 2. Configure HTTPS token if provided (e.g., GitHub Personal Access Token)
if [ -n "$GIT_TOKEN" ]; then
    echo "[BOOTSTRAP] Configuring Git credential store..."
    git config --global credential.helper store
    echo "https://x-access-token:${GIT_TOKEN}@github.com" > /root/.git-credentials
fi

# 3. Pre-clone and synchronization of declared project repositories
if [ -n "$PROJECT_MAPPINGS" ]; then
    echo "[BOOTSTRAP] Processing declared project mappings..."
    node -e '
      try {
        const mappings = JSON.parse(process.env.PROJECT_MAPPINGS || "{}");
        for (const [key, val] of Object.entries(mappings)) {
          const path = typeof val === "string" ? val : val.path;
          const gitUrl = typeof val === "object" ? val.gitUrl : null;
          const envBranch = process.env[`PROJECT_${key.toUpperCase()}_BASE_BRANCH`];
          const baseBranch = (typeof val === "object" && val.baseBranch) ? val.baseBranch : (envBranch || "main");
          if (path && gitUrl) {
            console.log(`${path}|${gitUrl}|${baseBranch}`);
          }
        }
      } catch (e) {}
    ' | while IFS='|' read -r TARGET_PATH GIT_URL BASE_BRANCH; do
        if [ -n "$TARGET_PATH" ] && [ -n "$GIT_URL" ]; then
            if [ ! -d "$TARGET_PATH/.git" ]; then
                echo "[BOOTSTRAP] Cloning $GIT_URL (branch: $BASE_BRANCH) into $TARGET_PATH..."
                mkdir -p "$TARGET_PATH"
                git clone -b "$BASE_BRANCH" "$GIT_URL" "$TARGET_PATH" || git clone "$GIT_URL" "$TARGET_PATH" || echo "[WARN] Failed to clone repository $GIT_URL"
            else
                echo "[BOOTSTRAP] Syncing existing repository $TARGET_PATH on branch $BASE_BRANCH..."
                git -C "$TARGET_PATH" fetch origin "$BASE_BRANCH" 2>/dev/null || git -C "$TARGET_PATH" fetch --all 2>/dev/null || true
                git -C "$TARGET_PATH" checkout "$BASE_BRANCH" 2>/dev/null || true
                git -C "$TARGET_PATH" reset --hard "origin/$BASE_BRANCH" 2>/dev/null || true
            fi
        fi
    done
fi

echo "[BOOTSTRAP] Bootstrap complete. Starting HRNS HTTP Server..."
exec "$@"