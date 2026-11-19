const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { merge, validate } = require('../src/sync/model');

const note = '笔记/甲.md', other = '笔记/乙.md';
test('不同文件合并，编辑和删除并发时保留编辑', () => {
  assert.deepEqual(merge({ [note]: '旧' }, { [other]: '本机' }, { [note]: '新' }).files,
    { [other]: '本机', [note]: '新' });
  assert.deepEqual(merge({ [note]: '旧' }, {}, { [note]: '旧' }).files, {});
});
test('同名冲突保留两个版本，失败后重复合并不会再生成副本', () => {
  const original = { [note]: '旧' }, a = { [note]: 'A' }, b = { [note]: 'B' };
  const result = merge(original, a, b);
  assert.deepEqual(result.files, { [note]: 'B', '笔记/甲（本机副本 1）.md': 'A' });
  assert.deepEqual(merge(original, a, result.files).files, result.files);
});
test('拒绝越界路径、大小写重名和畸形正文', () => {
  for (const files of [{ '../配置.md': '' }, { '笔记/../x.md': '' }, { '笔记/a.md': '', '笔记/A.md': '' }, { [note]: 3 }]) {
    assert.throws(() => validate(files));
  }
});

class TFile {
  constructor(path, text) { this.path = path; this.text = text; }
  get extension() { return this.path.split('.').pop(); }
}
class TFolder {
  constructor(children) { this.children = children; }
}
function device() {
  const files = new Map(), storage = new Map();
  const vault = {
    getMarkdownFiles: () => [...files.values()],
    getAbstractFileByPath: p => {
      if (files.has(p)) return files.get(p);
      const children = [...files.values()].filter(f => f.path.slice(0, f.path.lastIndexOf('/')) === p);
      return children.length ? new TFolder(children) : null;
    },
    read: async f => f.text,
    process: async (f, fn) => { f.text = fn(f.text); },
    create: async (p, text) => { assert.ok(!files.has(p)); files.set(p, new TFile(p, text)); },
    trash: async f => files.delete(f.path)
  };
  return { app: { vault, loadLocalStorage: k => storage.get(k), saveLocalStorage: (k, v) => storage.set(k, v) },
    ensureFolder: async () => {}, session: { owner: 'sample-user', token: 'test' }, files };
}
test('模拟两端首次同步、离线冲突、并发版本拒绝、重试、删除和私有仓库检查', async () => {
  let content, revision = 0, rejectNext = false, privateRepo = true, version = 1;
  let remoteOwner = 'Sample-User';
  let afterDownload;
  const requestUrl = async ({ url, method, body }) => {
    if (url.endsWith('/repos/sample-user/test')) return { status: 200, json: {
      private: privateRepo, owner: { login: remoteOwner }, default_branch: 'main', id: 42
    }};
    assert.ok(url.includes('/contents/yuki-workbench-v' + version + '.json'));
    if (method === 'GET') {
      afterDownload?.();
      return content ? { status: 200, json: { sha: String(revision), content } } : { status: 404 };
    }
    const data = JSON.parse(body);
    assert.equal(data.sha, revision ? String(revision) : undefined);
    if (rejectNext) { rejectNext = false; return { status: 409 }; }
    content = data.content;
    revision++;
    return { status: 200, json: {} };
  };
  const original = Module._load;
  const m = mock.method(Module, '_load', function (name, ...args) {
    return name === 'obsidian' ? { requestUrl, TFile, TFolder } : original.call(this, name, ...args);
  });
  let sync;
  try { ({ sync } = require('../src/sync/github')); } finally { m.mock.restore(); }
  const a = device(), b = device(), path = '雪间手帐/' + note;
  const fileListA = mock.method(a.app.vault, 'getMarkdownFiles');
  const fileListB = mock.method(b.app.vault, 'getMarkdownFiles');
  const lookups = mock.method(a.app.vault, 'getAbstractFileByPath');
  const reads = mock.method(a.app.vault, 'read');
  await a.app.vault.create(path, '原文');
  for (const excluded of ['私人.md', '雪间手帐/笔记/附件.png', '雪间手帐/笔记/子目录/笔记.md']) {
    await a.app.vault.create(excluded, '不在默认范围内');
  }
  await sync(a, 'test');
  await sync(b, 'test');
  assert.deepEqual(lookups.mock.calls.map(c => c.arguments[0]), ['雪间手帐/日记', '雪间手帐/笔记', '雪间手帐/待办']);
  assert.deepEqual(reads.mock.calls.map(c => c.arguments[0].path), [path]);
  assert.deepEqual([...b.files.keys()], [path]);
  assert.equal(b.files.get(path).text, '原文');
  for (const excluded of [...a.files.keys()].filter(p => p !== path)) a.files.delete(excluded);
  a.config = { allMarkdown: 'false' };
  a.files.get(path).text = '手机';
  b.files.get(path).text = '电脑';
  await sync(b, 'test');
  rejectNext = true;
  await assert.rejects(sync(a, 'test'), /409/);
  assert.equal(a.files.get(path).text, '手机');
  await sync(a, 'test');
  await sync(b, 'test');
  for (const d of [a,b]) assert.deepEqual([...d.files.values()].map(f => f.text).sort(), ['手机','电脑']);
  a.files.delete(path);
  await sync(a, 'test');
  await sync(b, 'test');
  assert.equal(b.files.size, 1);
  assert.equal(fileListA.mock.callCount(), 0);
  assert.equal(fileListB.mock.callCount(), 0);
  version = 2;
  content = undefined;
  revision = 0;
  a.config = b.config = { allMarkdown: true };
  for (const path of ['测试.md', '归档/会议/笔记.md', '2026-11-19.md', '.obsidian/隐藏.md']) {
    await a.app.vault.create(path, '- [ ] 正文');
  }
  await sync(a, 'test');
  await sync(b, 'test');
  for (const path of ['测试.md', '归档/会议/笔记.md', '2026-11-19.md']) {
    assert.equal(b.files.get(path).text, '- [ ] 正文');
  }
  assert.equal(b.files.has('.obsidian/隐藏.md'), false);
  assert.equal(fileListA.mock.callCount(), 1);
  assert.equal(fileListB.mock.callCount(), 1);
  remoteOwner = 'different-user';
  await assert.rejects(sync(a, 'test'), /私有仓库/);
  remoteOwner = 'Sample-User';
  privateRepo = false;
  await assert.rejects(sync(a, 'test'), /私有仓库/);
  privateRepo = true;
  const previousRevision = revision;
  const previousBaseline = a.app.loadLocalStorage('snow-v2-base-42-main');
  await a.app.vault.create('待上传.md', '尚未同步');
  afterDownload = () => { a.session = null; };
  await assert.rejects(sync(a, 'test'), /同步已停止/);
  assert.equal(revision, previousRevision);
  assert.equal(a.app.loadLocalStorage('snow-v2-base-42-main'), previousBaseline);
});
