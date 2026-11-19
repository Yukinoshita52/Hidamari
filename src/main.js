const { Plugin, PluginSettingTab, Setting, Notice, editorInfoField } = require('obsidian');
const { todoExtension } = require('./editor/todo');
const { login, sync } = require('./sync/github');

class Preferences extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const p = this.plugin, el = this.containerEl;
    el.empty();
    el.createEl('h2', { text: 'Hidamari' });
    for (const [key, label, desc] of [
      ['client', 'GitHub Client ID', '填写已开启 Device Flow 的个人 OAuth App Client ID。'],
      ['repo', '私有仓库名称', '使用当前登录账号名下已初始化的私有仓库，两端填写相同名称。']
    ]) new Setting(el).setName(label).setDesc(desc).addText(t =>
      t.setValue(p.config[key]).onChange(async v => {
        if (key === 'client') p.session = null;
        p.config[key] = v.trim();
        await p.saveData(p.config);
      }));
    new Setting(el).setName('同步全库 Markdown').setDesc('包括普通笔记和原生每日笔记。两端都开启后使用独立快照；关闭时沿用旧版三个目录。')
      .addToggle(t => t.setValue(p.config.allMarkdown === true).onChange(async enabled => {
        p.config.allMarkdown = enabled;
        await p.saveData(p.config);
      }));
    new Setting(el).setName('自动同步').setDesc('登录后，Obsidian 在前台时每 5 分钟同步一次。')
      .addToggle(t => t.setValue(p.config.auto).onChange(async enabled => {
        p.config.auto = enabled;
        await p.saveData(p.config);
      }));
    new Setting(el).setName('GitHub 账号').setDesc('登录授权仅在本次 Obsidian 会话内有效。')
      .addButton(b => b.setButtonText(p.session ? '退出登录' : '登录 GitHub').onClick(async () => {
        if (p.busy) return;
        try {
          p.busy = true;
          if (p.session) p.session = null;
          else if (p.config.client) await login(p, p.config.client);
          else throw Error('请先填写 Client ID');
        } catch (e) { new Notice(e.message); }
        finally { p.busy = false; this.display(); }
      }));
  }
}
module.exports = class SnowPlugin extends Plugin {
  async onload() {
    this.stopped = false;
    this.config = { repo: '', client: '', auto: true, ...await this.loadData() };
    this.addSettingTab(new Preferences(this.app, this));
    this.registerEditorExtension(todoExtension(state => state.field(editorInfoField, false)?.file?.extension === 'md'));
    this.registerInterval(window.setInterval(() => {
      if (this.config.auto && this.session && this.config.repo && !this.busy && !document.hidden) this.synchronize();
    }, 300000));
    this.addCommand({ id: 'sync', name: '立即同步', callback: () => this.synchronize() });
  }
  onunload() { this.stopped = true; this.session = null; }
  async ensureFolder(path) {
    let current = '';
    for (const part of path.split('/')) {
      current = current ? current + '/' + part : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try { await this.app.vault.createFolder(current); }
        catch (e) { if (!this.app.vault.getAbstractFileByPath(current)) throw e; }
      }
    }
  }
  async synchronize() {
    if (this.busy) return new Notice('正在连接 GitHub');
    this.busy = true;
    const progress = new Notice('正在同步 Hidamari…', 0);
    try { new Notice(await sync(this, this.config.repo)); }
    catch (e) { new Notice(e.message); }
    finally { progress.hide(); this.busy = false; }
  }
};
