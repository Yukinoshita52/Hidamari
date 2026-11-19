# Hidamari

Hidamari 是用于 Obsidian 的独立插件，提供 Markdown 待办输入和个人 GitHub 私有仓库同步功能。

## 安装到电脑或 Android

1. 按下方步骤构建插件，将 `dist/main.js` 和 `dist/manifest.json` 复制到目标笔记库的 `.obsidian/plugins/yuki-workbench/`。也可以将 `Hidamari.zip` 直接解压到同一目录。
2. 在 Obsidian 的「设置 → 第三方插件」中启用 Hidamari。已有安装可更新同一目录中的 `main.js` 和 `manifest.json`，然后重新加载插件。
3. 打开 Markdown 笔记，在新的一行输入 `[]` 或 `【】`，再按空格。

## 日常记录

在普通笔记或每日笔记里，输入 `[]`、`【】`、`- []` 或 `-【】` 后按一次空格，即可生成 Markdown 待办。直接接着写事项，实时预览中可以勾选。光标紧跟复选框时按一次 Backspace，即可移除整个框，并保留右侧正文和当前行。也可以在段落末尾先留一个空格，再输入上述写法，待办会另起一行。

日记使用 Obsidian 自带「日记」插件的日历按钮，普通笔记使用 Obsidian 编辑器。旧版工作台写过的 Markdown 仍在原位置。

## 配置 GitHub 同步

待办编辑可离线使用。GitHub 同步是可选功能，两台设备使用同一 GitHub 账号、OAuth 应用和私有数据仓库。授权时会连接 github.com，完成登录后会通过 api.github.com 读取账号信息，并在选定的私有仓库中读写笔记快照。快照包含同步范围内的文件路径和 Markdown 正文。

1. 使用你自己的 GitHub 账号创建一个**私有仓库**，例如 `snow-journal-data`，勾选添加 README 以初始化默认分支。
2. 在 GitHub 的 Settings → Developer settings → OAuth Apps → New OAuth App 创建个人应用。名称可填「Hidamari」，Homepage URL 可填个人 GitHub 主页，Authorization callback URL 可填 `http://localhost`。勾选 **Enable Device Flow** 并保存，复制公开的 **Client ID**。设备流程只使用 Client ID。
3. 在两端 Obsidian 的「设置 → Hidamari」填写相同的 Client ID 和仓库名称，分别点「登录 GitHub」。复制设备码，在打开的 GitHub 页面确认账号并授权，再返回 Obsidian。此 OAuth App 使用 GitHub 的 `repo` 范围，授权页显示的权限覆盖该账号可访问的私有仓库。插件只向配置的个人私有仓库读写工作台快照。
4. 要同步普通笔记和原生日记，请在两端开启「同步全库 Markdown」，然后先在有记录的设备执行命令「Hidamari：立即同步」，再到另一端执行同一命令。默认在 Obsidian 前台、已登录时每 5 分钟同步一次，可在设置里关闭。Android 切换设备前可手动同步。令牌仅存内存，重启或系统结束应用后需要重新登录。

[GitHub 设备授权流程](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)

### 同步范围与冲突

- 开启「同步全库 Markdown」后，按仓库相对路径同步所有普通 Markdown，包含根目录和子目录，跳过隐藏目录、配置和附件。新快照为 `yuki-workbench-v2.json`。从旧版升级时可先按旧范围同步，再在两端切换。
- 默认沿用旧版范围，只处理仓库内 `雪间手帐/日记/`、`雪间手帐/笔记/`、`雪间手帐/待办/` 的直属 Markdown 文件。附件、子目录、主题和其他仓库文件不在范围内。
- 旧版范围的快照写入 GitHub 默认分支的 `yuki-workbench-v1.json`，可从提交历史找回旧内容。本版单份快照上限为 950,000 个 UTF-8 字节。超过上限会保留本地记录并提示。
- 两端修改不同文件会自动合并。同一文件同时修改，远端版本保留原名，本机版本保存为「本机副本」。打开两个版本整理后，可删除多余副本再同步。
- 单端删除会传播，另一端的对应文件移入本地仓库的 `.trash`。一端删除、另一端修改时保留有修改的正文。
- 同时上传遇到版本冲突时，点「同步」重试。断网时仍可在本地保存。若远端快照意外消失，已有同步基线的设备会提示先从 GitHub 历史恢复。

## 从源码构建

使用 Node.js 22 或更高版本，在项目目录执行：

```sh
npm ci
npm test
npm run build
```

插件入口为 `src/main.js`，编辑器扩展位于 `src/editor/`，GitHub 同步逻辑位于 `src/sync/`。构建会在 `dist/` 生成可安装的 `main.js` 和 `manifest.json`。`yuki-workbench` 是已有安装使用的 Obsidian 插件 ID。

## 许可证

[MIT](LICENSE)
