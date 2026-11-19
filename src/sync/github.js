const { Modal, Notice, requestUrl, TFile, TFolder } = require('obsidian');
const { ROOT, folders, validPath, validMarkdownPath, validate, merge } = require('./model');
const limit = 950000;
async function request(url, method, body, token) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return requestUrl({ url, method, headers, throw: false,
    ...(body ? { contentType: 'application/json', body: JSON.stringify(body) } : {}) });
}
function checked(res, action) {
  if (res.status < 200 || res.status > 299) throw Error(action + '失败（HTTP ' + res.status + '），请检查网络、账号授权和仓库设置后重试');
  return res.json;
}
async function login(plugin, client) {
  const auth = checked(await request('https://github.com/login/device/code', 'POST', { client_id: client, scope: 'repo' }), '获取设备码');
  if (!auth.user_code || !auth.device_code) throw Error('请确认 Client ID 已开启 Device Flow');
  const modal = new Modal(plugin.app);
  let closed = false;
  modal.onClose = () => { closed = true; };
  modal.setTitle('连接 GitHub');
  modal.contentEl.createEl('p', { text: '复制设备码，在 GitHub 授权后回到这里。' });
  modal.contentEl.createEl('code', { text: auth.user_code });
  modal.contentEl.createEl('p').createEl('a', { text: '打开 GitHub 授权页面', href: 'https://github.com/login/device', attr: { target: '_blank', rel: 'noopener' } });
  modal.open();
  let wait = (auth.interval || 5) * 1000;
  const end = Date.now() + auth.expires_in * 1000;
  try {
    while (!closed && Date.now() < end && !plugin.stopped) {
      await new Promise(resolve => setTimeout(resolve, wait));
      if (closed || plugin.stopped) return;
      const data = checked(await request('https://github.com/login/oauth/access_token', 'POST',
        { client_id: client, device_code: auth.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }), '登录');
      if (data.access_token) {
        const who = checked(await request('https://api.github.com/user', 'GET', null, data.access_token), '核对身份');
        if (!who.login) throw Error('无法识别 GitHub 账号');
        if (closed || plugin.stopped || plugin.config.client !== client) return;
        plugin.session = { owner: who.login, token: data.access_token };
        new Notice('已连接 ' + who.login);
        return;
      }
      if (data.error === 'slow_down') wait += 5000;
      else if (data.error !== 'authorization_pending') throw Error('授权未完成，请重新登录');
    }
    if (!closed) throw Error('设备码已过期');
  } finally { modal.close(); }
}
function encode(bytes) {
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
function legacyMarkdownFiles(vault) {
  const files = [];
  for (const name of folders) {
    const folder = vault.getAbstractFileByPath(ROOT + '/' + name);
    if (!(folder instanceof TFolder)) continue;
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension.toLowerCase() === 'md') files.push(child);
    }
  }
  return files;
}

async function sync(plugin, repo) {
  if (!plugin.session) throw Error('请在 Hidamari 设置中登录 GitHub');
  if (!/^[a-z0-9_-][a-z0-9._-]*$/i.test(repo)) throw Error('请填写个人私有仓库名称');
  const session = plugin.session;
  const { owner, token } = session;
  function checkSession() {
    if (plugin.stopped || plugin.session !== session) throw Error('登录状态已改变，同步已停止');
  }
  const endpoint = 'https://api.github.com/repos/' + owner + '/' + repo;
  const api = (path, method = 'GET', body) => {
    checkSession();
    return request(endpoint + path, method, body, token);
  };
  const info = checked(await api(''), '读取仓库');
  if (!info.private || info.owner.login.toLowerCase() !== owner.toLowerCase()) throw Error('只支持本人名下的私有仓库');
  const vault = plugin.app.vault;
  const all = plugin.config?.allMarkdown === true;
  const version = all ? 2 : 1;
  const configDir = vault.configDir?.toLowerCase() || '.obsidian';
  const accept = all ? p => validMarkdownPath(p) && !p.toLowerCase().startsWith(configDir + '/') : validPath;
  const path = '/contents/yuki-workbench-v' + version + '.json';
  const branch = info.default_branch;
  const savedKey = (all ? 'snow-v2-base-' : 'snow-base-') + info.id + '-' + branch;
  const base = validate(plugin.app.loadLocalStorage(savedKey) ?? {}, accept);
  const res = await api(path + '?ref=' + encodeURIComponent(branch));
  let sha, remote = {};
  if (res.status !== 404) {
    const data = checked(res, '下载快照');
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(data.content), c => c.charCodeAt(0))));
    if (parsed.version !== version) throw Error('快照版本不兼容');
    remote = validate(parsed.files, accept);
    sha = data.sha;
  } else if (Object.keys(base).length) throw Error('已有同步基线，但远端快照缺失，请先恢复仓库文件');
  const local = {};
  const candidates = all ? vault.getMarkdownFiles() : legacyMarkdownFiles(vault);
  for (const file of candidates) {
    const rel = all ? file.path : file.path.slice(ROOT.length + 1);
    if (all && (rel.split('/').some(part => part.startsWith('.')) || rel.toLowerCase().startsWith(configDir + '/'))) continue;
    if (!accept(rel)) throw Error('文件名不兼容：' + rel);
    local[rel] = await vault.read(file);
  }
  validate(local, accept);
  const { files, conflicts } = merge(base, local, remote, accept);
  const bytes = new TextEncoder().encode(JSON.stringify({ version, files }));
  if (bytes.length > limit) throw Error('同步快照超过 950,000 字节，请缩小同步范围或精简内容后重试');
  const names = new Set([...Object.keys(files), ...Object.keys(remote)]);
  if (!sha || [...names].some(p => files[p] !== remote[p])) {
    checked(await api(path, 'PUT', { message: '同步 Hidamari', branch, content: encode(bytes), ...(sha && { sha }) }), '上传快照（其他设备刚同步时请重试）');
  }
  // 应用下载前再次核对本机正文，保留同步期间的编辑。
  for (const p of new Set([...Object.keys(local), ...Object.keys(files)])) {
    checkSession();
    if (local[p] === files[p]) continue;
    const full = all ? p : ROOT + '/' + p, file = vault.getAbstractFileByPath(full);
    if (!file && local[p] === undefined) {
      if (full.includes('/')) await plugin.ensureFolder(full.slice(0, full.lastIndexOf('/')));
      checkSession();
      await vault.create(full, files[p]);
    } else if (file instanceof TFile && files[p] !== undefined) {
      await vault.process(file, current => {
        checkSession();
        if (current !== local[p]) throw Error('同步期间文件已修改，请重新同步');
        return files[p];
      });
    } else if (file instanceof TFile && await vault.read(file) === local[p]) {
      checkSession();
      await vault.trash(file, false);
    } else throw Error('同步期间文件已变化，请重新同步');
  }
  checkSession();
  plugin.app.saveLocalStorage(savedKey, files);
  return conflicts.length ? '已同步，同时修改的文件已保留：' + conflicts.join('、') : '已同步';
}
module.exports = { login, sync };
