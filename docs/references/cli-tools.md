# CLI Tools Reference

When a task involves an operation covered by one of these tools, use the tool rather than constructing raw API calls or curl requests.

## glab — GitLab Operations

Handles all GitLab interactions: merge requests, CI/CD pipelines, issues, repository operations. Auth is pre-configured against `dev.aminer.cn`.

**Use when:** creating or reviewing MRs, checking pipeline status, managing CI jobs, interacting with the GitLab API.

Key subcommands:
- `glab mr` — create, list, view, merge MRs
- `glab ci` — view and manage pipelines
- `glab job` — manage CI jobs (view logs, retry)
- `glab issue` — manage issues
- `glab api` — raw GitLab API access

Run `glab <subcommand> --help` for details.

## ags — Sandbox Operations

Manages sandbox instances and tools. Supports both E2B and Tencent Cloud backends; defaults to Tencent Cloud.

**Use when:** creating, inspecting, or deleting sandbox instances; running code or shell commands inside a sandbox; managing sandbox templates (tools).

Key subcommands:
- `ags tool` — list and manage sandbox templates
- `ags instance` — create, list, delete sandbox instances
- `ags run` — execute code in a sandbox
- `ags exec` — execute a shell command in a sandbox
- `ags file` — file operations in a sandbox

Run `ags <subcommand> --help` for details.
