// Single-pack deploy upload (Q-13) — stage the site tree into a throwaway repo, one root commit, then
// force-push it to `gh-pages`. ONE pack push replaces the whole ref (no base_tree), which is what lets
// a tile-heavy library deploy in seconds instead of thousands of per-blob REST calls. git2 mechanics
// and gotchas are from docs/spikes/2026-07-git2-in-tauri.md.

use serde::Serialize;
use std::path::Path;

use super::DeployError;

// The commit is a publish artifact, not authored work — a fixed, non-personal identity.
const COMMIT_NAME: &str = "Archie";
const COMMIT_EMAIL: &str = "publish@archie.local";
const COMMIT_MESSAGE: &str = "Publish to the web";
// We name the local ref explicitly rather than trusting `Repository::init`'s default branch, which the
// spike found is NOT reliably `main`/`master` across libgit2 builds.
const LOCAL_PUSH_REF: &str = "refs/heads/gh-pages";

/// The push outcome. Mirrors the Task 6 contract `{ commitSha }`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub commit_sha: String,
}

/// Any git2 failure becomes a `push` DeployError. A libgit2 HTTP 404 means either the repo doesn't
/// exist yet or the token can't see it (GitHub returns 404 for both) — say so, don't just echo "404".
fn push_err(err: git2::Error) -> DeployError {
    let message = if err.message().contains("404") {
        "GitHub returned 404 — the repository doesn't exist yet, or the sign-in doesn't have access to it."
            .to_string()
    } else {
        err.message().to_string()
    };
    DeployError::new("push", message)
}

/// Stage every file under `dir` into a fresh repo and record it as a single parent-less commit on the
/// local `gh-pages` ref. Returns the repo (so the caller can push it) and the new commit's oid. The
/// `.git` directory libgit2 creates inside `dir` is never itself added to the tree (libgit2 skips it).
fn stage_and_commit(dir: &Path) -> Result<(git2::Repository, git2::Oid), DeployError> {
    let repo = git2::Repository::init(dir).map_err(push_err)?;

    // Scope the repo-borrowing handles (index, tree) so they drop before `repo` is moved out.
    let commit_oid = {
        let mut index = repo.index().map_err(push_err)?;
        // `*` stages every path under the work tree recursively; libgit2 never adds the `.git` dir.
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .map_err(push_err)?;
        index.write().map_err(push_err)?;
        let tree_oid = index.write_tree().map_err(push_err)?;
        let tree = repo.find_tree(tree_oid).map_err(push_err)?;

        let sig = git2::Signature::now(COMMIT_NAME, COMMIT_EMAIL).map_err(push_err)?;
        // No parents + an explicit ref name: a full-replacement root commit on a deterministic
        // `gh-pages` ref (not HEAD's default branch, which the spike found unreliable).
        repo.commit(Some(LOCAL_PUSH_REF), &sig, &sig, COMMIT_MESSAGE, &tree, &[])
            .map_err(push_err)?
    };

    Ok((repo, commit_oid))
}

/// Stage, commit, and force-push `dir` to `owner/repo`'s `branch`. Blocking (libgit2 C + network), so
/// the command runs it off the async reactor. The token is used ONLY as the push credential — it is
/// never written into the repo's `.git/config` (the remote is anonymous/in-memory, and its URL carries
/// no token).
fn push_tree_blocking(
    dir: &str,
    owner: &str,
    repo: &str,
    branch: &str,
    token: &str,
) -> Result<PushResult, DeployError> {
    let (git_repo, commit_oid) = stage_and_commit(Path::new(dir))?;

    // Anonymous remote: not persisted to .git/config, so nothing about this push touches disk state.
    let url = format!("https://github.com/{owner}/{repo}.git");
    let mut remote = git_repo.remote_anonymous(&url).map_err(push_err)?;

    let mut callbacks = git2::RemoteCallbacks::new();
    // GitHub token auth over HTTPS: username "x-access-token", token as password (spike-proven).
    callbacks.credentials(move |_url, _username, _allowed| {
        git2::Cred::userpass_plaintext("x-access-token", token)
    });
    // Server-side rejections surface here, not from `remote.push`'s Ok (spike gotcha #5).
    let rejection = std::rc::Rc::new(std::cell::RefCell::new(None::<String>));
    let sink = rejection.clone();
    callbacks.push_update_reference(move |refname, status| {
        if let Some(msg) = status {
            *sink.borrow_mut() = Some(format!("{refname}: {msg}"));
        }
        Ok(())
    });

    let mut opts = git2::PushOptions::new();
    opts.remote_callbacks(callbacks);
    // Force (`+`): the publisher fully owns gh-pages, and a publish is a full replacement of the ref.
    let refspec = format!("+{LOCAL_PUSH_REF}:refs/heads/{branch}");
    remote.push(&[refspec.as_str()], Some(&mut opts)).map_err(push_err)?;

    if let Some(msg) = rejection.borrow().clone() {
        return Err(DeployError::new("push", format!("GitHub rejected the upload ({msg}).")));
    }
    Ok(PushResult { commit_sha: commit_oid.to_string() })
}

/// Push the staged site tree at `dir` to `owner/repo`'s `branch` as one pack (Q-13). `dir` is an
/// absolute path the webview staged via the Tauri fs plugin; its contents become the deployed site.
#[tauri::command]
pub async fn gh_push_tree(
    dir: String,
    owner: String,
    repo: String,
    branch: String,
    token: String,
) -> Result<PushResult, DeployError> {
    tauri::async_runtime::spawn_blocking(move || {
        push_tree_blocking(&dir, &owner, &repo, &branch, &token)
    })
    .await
    .unwrap_or_else(|_| Err(DeployError::new("push", "The upload task did not complete.")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stage_and_commit_tree_mirrors_the_dir_exactly() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("index.html"), b"<h1>hi</h1>").unwrap();
        std::fs::write(dir.path().join("data.json"), b"{}").unwrap();
        std::fs::create_dir(dir.path().join("assets")).unwrap();
        std::fs::write(dir.path().join("assets").join("app.js"), b"//x").unwrap();

        let (repo, oid) = stage_and_commit(dir.path()).expect("commits");
        let commit = repo.find_commit(oid).expect("commit exists");
        let tree = commit.tree().expect("tree");

        // Top level lists exactly the staged entries — and never the .git dir libgit2 created in `dir`.
        let mut names: Vec<String> =
            tree.iter().map(|e| e.name().unwrap_or_default().to_string()).collect();
        names.sort();
        assert_eq!(names, vec!["assets", "data.json", "index.html"]);

        // Nested files are committed too (recursive stage).
        let assets = tree
            .get_name("assets")
            .and_then(|e| e.to_object(&repo).ok())
            .and_then(|o| o.peel_to_tree().ok())
            .expect("assets subtree");
        assert!(assets.get_name("app.js").is_some(), "nested file is in the tree");

        // It's a root commit (no parents) with the fixed publish identity.
        assert_eq!(commit.parent_count(), 0, "single-pack full replacement is a parent-less commit");
        assert_eq!(commit.author().name(), Some(COMMIT_NAME));
        assert_eq!(commit.author().email(), Some(COMMIT_EMAIL));

        // commitSha is the oid we return to JS.
        assert_eq!(PushResult { commit_sha: oid.to_string() }.commit_sha, oid.to_string());
    }

    /// Live push — user-run (needs a real token + scratch repo). Mirrors the spike's `push_smoke`.
    /// Create the scratch repo first, e.g. `gh repo create <owner>/<repo> --private`, then:
    ///   GITHUB_TOKEN=$(gh auth token) cargo test -p archie push_live -- --ignored --nocapture
    #[test]
    #[ignore = "requires GITHUB_TOKEN + a scratch repo; run manually (plan Task 6 Step 3)"]
    fn push_live() {
        let token = std::env::var("GITHUB_TOKEN").expect("set GITHUB_TOKEN");
        let owner = std::env::var("ARCHIE_PUSH_OWNER").unwrap_or_else(|_| "micahchoo".into());
        let repo = std::env::var("ARCHIE_PUSH_REPO").unwrap_or_else(|_| "archie-pages-probe".into());

        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("index.html"), b"<h1>archie push_live</h1>").unwrap();

        let started = std::time::Instant::now();
        let result = push_tree_blocking(dir.path().to_str().unwrap(), &owner, &repo, "gh-pages", &token)
            .expect("push succeeds");
        eprintln!("push_live: commit {} in {:?}", result.commit_sha, started.elapsed());
    }
}
