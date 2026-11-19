# Hidamari

Hidamari helps you turn a line in an Obsidian note into a task without leaving the keyboard. You can also sync Markdown notes between devices through a private GitHub repository that you own.

[简体中文](README.zh-CN.md)

## Create a task

Install **Hidamari** from [Obsidian Community](https://community.obsidian.md/plugins/yuki-workbench) and enable it under **Settings → Community plugins**.

On a new line, type `[]` or `【】` and press Space. Hidamari expands the brackets to `- [ ] ` and leaves the cursor ready for the task text. To turn the task back into plain text, place the cursor immediately after the checkbox and its trailing space, then press Backspace. The text stays on the same line. Task editing works offline.

## Optional GitHub sync

1. Create a private repository under your personal GitHub account. Initialize it with a README so it has a default branch.
2. In **GitHub Settings → Developer settings → OAuth Apps**, create an OAuth app and enable **Device Flow**. You can use your GitHub profile for the homepage and `http://localhost` for the callback URL. Copy the app’s public **Client ID**.
3. On each device, open **Settings → Hidamari**, enter the same Client ID and repository name, and select **登录 GitHub** (sign in). Enter the device code on GitHub. The token stays in memory for the current session.
4. To include regular vault notes and daily notes, enable **同步全库 Markdown** (sync all Markdown) on each device. Run **Hidamari: 立即同步** (sync now) on the device that already has your notes, then on the other device. Automatic sync runs every five minutes while Obsidian is in the foreground and you are signed in.

With whole-vault sync turned off, Hidamari syncs only Markdown files directly inside the legacy folders `雪间手帐/日记/`, `雪间手帐/笔记/`, and `雪间手帐/待办/`. Whole-vault sync includes Markdown in subfolders and skips hidden directories, vault configuration, and attachments. If both devices edit the same note, the remote version keeps its name and the local edit is saved alongside it as a separate copy.

## What is sent to GitHub?

When you enable sync, Hidamari uses `github.com` for authorization and `api.github.com` to check your account and read or write a snapshot in the private repository you selected. The snapshot contains the paths and full text of the notes in scope. GitHub’s device authorization asks for the `repo` scope, which grants access to private repositories available to your account. Each snapshot is limited to 950,000 UTF-8 bytes.

## Build locally

With Node.js 22 or later, run:

```sh
npm ci
npm test
npm run build
```

For manual installation, copy `dist/main.js` and `dist/manifest.json` into `.obsidian/plugins/yuki-workbench/` inside your vault. You can also download both files from the [GitHub releases](https://github.com/Yukinoshita52/Hidamari/releases).

## License

[MIT](LICENSE)
