// Single-pack deploy upload (Q-13) — stage the site tree into a throwaway repo, commit it on top of
// the remote branch's current tip, then force-push to `gh-pages`. ONE pack push replaces the whole
// ref, which is what lets a tile-heavy library deploy in seconds instead of thousands of per-blob
// REST calls. git2 mechanics and gotchas are from docs/spikes/2026-07-git2-in-tauri.md.

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

/// Stage every file under `dir` into the repo and record a commit on the local `gh-pages` ref,
/// parented on `base` when the remote branch already had one (see `fetch_base`). Returns the new
/// commit's oid. The `.git` directory libgit2 creates inside `dir` is never itself added to the
/// tree (libgit2 skips it).
fn stage_and_commit(
    repo: &git2::Repository,
    base: Option<git2::Oid>,
) -> Result<git2::Oid, DeployError> {
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
        // Parent the commit on the fetched remote tip when there is one — and an explicit local ref
        // name (`gh-pages`, not HEAD's default branch, which the spike found unreliable). The parent
        // is irrelevant to ref acceptance (the push is forced, `+` below); it exists purely for pack
        // negotiation: libgit2's push hides every advertised remote ref from the pack revwalk, but a
        // hidden oid it can't find in the local odb is silently skipped (push.c queue_objects), so a
        // parentless commit re-ships every blob on every deploy while a parented one ships only the
        // changed objects.
        let parents: Vec<git2::Commit> = base
            .iter()
            .filter_map(|oid| repo.find_commit(*oid).ok())
            .collect();
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
        repo.commit(
            Some(LOCAL_PUSH_REF),
            &sig,
            &sig,
            COMMIT_MESSAGE,
            &tree,
            &parent_refs,
        )
        .map_err(push_err)?
    };

    Ok(commit_oid)
}

/// Fetch `branch`'s current tip into the staging repo and return it, so `stage_and_commit` can
/// parent the new commit on it and the push's pack negotiation can exclude everything the remote
/// already has. Any fetch failure — first publish (the branch doesn't exist yet), offline, auth
/// trouble — returns `None`, which degrades to the old parentless-root-commit full-pack behavior;
/// the push itself still reports real errors. (Local-transport subtlety: the temp ref under
/// `refs/remotes/` persists in the staging dir's `.git`, which libgit2 never stages.)
fn fetch_base(
    repo: &git2::Repository,
    remote: &mut git2::Remote<'_>,
    branch: &str,
    token: &str,
) -> Option<git2::Oid> {
    let local_ref = format!("refs/remotes/publish/{branch}");
    let refspec = format!("+refs/heads/{branch}:{local_ref}");
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(move |_url, _username, _allowed| {
        git2::Cred::userpass_plaintext("x-access-token", token)
    });
    let mut opts = git2::FetchOptions::new();
    opts.remote_callbacks(callbacks);
    remote.fetch(&[refspec.as_str()], Some(&mut opts), None).ok()?;
    repo.find_reference(local_ref.as_str())
        .ok()?
        .peel_to_commit()
        .ok()
        .map(|commit| commit.id())
}

/// Stage, commit, and force-push `dir` to `owner/repo`'s `branch`. Blocking (libgit2 C + network),
/// so the command runs it off the async reactor.
fn push_tree_blocking(
    dir: &str,
    owner: &str,
    repo: &str,
    branch: &str,
    token: &str,
) -> Result<PushResult, DeployError> {
    let url = format!("https://github.com/{owner}/{repo}.git");
    push_tree_to_url(dir, &url, branch, token)
}

/// The transport-agnostic core: stage, commit (parented on the remote tip when it exists), and
/// force-push `dir` to `url`'s `branch`. The token is used ONLY as the fetch/push credential — it
/// is never written into the repo's `.git/config` (the remote is anonymous/in-memory, and its URL
/// carries no token). `url` is a parameter so tests can point it at a local bare repo.
fn push_tree_to_url(
    dir: &str,
    url: &str,
    branch: &str,
    token: &str,
) -> Result<PushResult, DeployError> {
    let git_repo = git2::Repository::init(Path::new(dir)).map_err(push_err)?;

    // Anonymous remote: not persisted to .git/config, so nothing about this push touches disk state.
    let mut remote = git_repo.remote_anonymous(url).map_err(push_err)?;

    let base = fetch_base(&git_repo, &mut remote, branch, token);
    let commit_oid = stage_and_commit(&git_repo, base)?;

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

        let repo = git2::Repository::init(dir.path()).expect("staging repo");
        let oid = stage_and_commit(&repo, None).expect("commits");
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

        // With no fetched base it's a root commit (no parents) with the fixed publish identity.
        assert_eq!(commit.parent_count(), 0, "first publish (no base) is a parent-less commit");
        assert_eq!(commit.author().name(), Some(COMMIT_NAME));
        assert_eq!(commit.author().email(), Some(COMMIT_EMAIL));

        // commitSha is the oid we return to JS.
        assert_eq!(PushResult { commit_sha: oid.to_string() }.commit_sha, oid.to_string());
    }

    /// Archie-35ad acceptance, measured against a LOCAL BARE repo as the remote: the first push
    /// ships the full pack; a second push with one changed blob ships only the new objects. The
    /// local transport writes the shipped packfile straight into the bare remote's `objects/pack/`
    /// (git_packbuilder_write in transports/local.c), so pack sizes and odb object counts are read
    /// off what actually shipped — not reasoned about.
    #[test]
    fn second_push_ships_only_the_new_blobs() {
        let remote_dir = tempfile::tempdir().expect("tempdir");
        git2::Repository::init_bare(remote_dir.path()).expect("bare remote");
        let url = remote_dir.path().to_str().expect("utf-8 path");

        // A big INCOMPRESSIBLE payload (xorshift bytes) so a full re-ship shows up in pack bytes
        // instead of being compressed away.
        let mut x = 0x1234_5678u32;
        let unchanged: Vec<u8> = (0..65_536)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 17;
                x ^= x << 5;
                x as u8
            })
            .collect();
        let dir1 = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir1.path().join("index.html"), b"<h1>v1</h1>").unwrap();
        std::fs::write(dir1.path().join("blob.bin"), &unchanged).unwrap();
        std::fs::write(dir1.path().join("data.json"), b"{\"v\":1}").unwrap();

        let push1 =
            push_tree_to_url(dir1.path().to_str().unwrap(), url, "gh-pages", "unused-token")
                .expect("first push succeeds");
        let packs1 = pack_files(remote_dir.path());
        assert_eq!(packs1.len(), 1, "first push wrote exactly one pack");
        assert_eq!(count_objects(remote_dir.path()), 5, "full pack: 3 blobs + tree + commit");

        // Second publish: a FRESH staging dir (the webview stages a new one every deploy), same
        // index.html and blob.bin, one changed blob.
        let dir2 = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir2.path().join("index.html"), b"<h1>v1</h1>").unwrap();
        std::fs::write(dir2.path().join("blob.bin"), &unchanged).unwrap();
        std::fs::write(dir2.path().join("data.json"), b"{\"v\":2}").unwrap();

        let push2 =
            push_tree_to_url(dir2.path().to_str().unwrap(), url, "gh-pages", "unused-token")
                .expect("second push succeeds");
        let packs2 = pack_files(remote_dir.path());
        assert_eq!(packs2.len(), 2, "second push wrote its own pack");
        let (pack2, pack2_bytes) =
            packs2.iter().find(|(p, _)| Some(p) != Some(&packs1[0].0)).expect("second pack");
        let (_, pack1_bytes) = packs1[0];
        assert_eq!(count_objects(remote_dir.path()), 8, "second pack adds only blob + tree + commit");
        eprintln!("pack sizes: first push {pack1_bytes} bytes, second push {pack2_bytes} bytes");
        assert!(
            *pack2_bytes < pack1_bytes / 4,
            "pack shrank {pack1_bytes} -> {pack2_bytes} bytes (pack {})",
            pack2.display()
        );

        // The remote tip is the new commit, parented on the first push's commit.
        let bare = git2::Repository::open(remote_dir.path()).expect("open bare remote");
        let tip = bare
            .find_reference("refs/heads/gh-pages")
            .expect("gh-pages exists")
            .peel_to_commit()
            .expect("tip commit");
        assert_eq!(tip.id().to_string(), push2.commit_sha);
        assert_eq!(tip.parent_count(), 1, "deploy commit is parented on the previous tip");
        assert_eq!(tip.parent_id(0).expect("parent").to_string(), push1.commit_sha);
    }

    /// `(path, byte size)` of every `.pack` in the bare remote's objects/pack dir, sorted by path.
    fn pack_files(remote_root: &std::path::Path) -> Vec<(std::path::PathBuf, u64)> {
        let mut out: Vec<_> = std::fs::read_dir(remote_root.join("objects").join("pack"))
            .expect("objects/pack exists")
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "pack"))
            .map(|p| (p.clone(), p.metadata().expect("pack metadata").len()))
            .collect();
        out.sort();
        out
    }

    /// Distinct objects visible in the bare remote's odb (packs included).
    fn count_objects(remote_root: &std::path::Path) -> usize {
        let bare = git2::Repository::open(remote_root).expect("open bare remote");
        let odb = bare.odb().expect("odb");
        let mut count = 0usize;
        odb.foreach(|_| {
            count += 1;
            true
        })
        .expect("odb foreach");
        count
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
