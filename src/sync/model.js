const ROOT = '雪间手帐';
const folders = ['日记', '笔记', '待办'];
const keyOf = path => path.normalize('NFC').toLowerCase();
function validPath(path) {
  const [folder, name, ...extra] = path.split('/');
  return folders.includes(folder) && !extra.length && name?.endsWith('.md') &&
    !name.startsWith('.') && !/[\\:*?"<>|\u0000-\u001f]/u.test(name) && name.length <= 200;
}
function validMarkdownPath(path) {
  return /\.md$/i.test(path) && path.split('/').every(part =>
    part.length > 0 && !part.startsWith('.') && !/[. ]$/.test(part) &&
    !/[\\:*?"<>|\u0000-\u001f]/u.test(part));
}
function validate(files, accept = validPath) {
  if (!files || Array.isArray(files) || typeof files !== 'object') throw Error('文件清单格式无效');
  const keys = new Set();
  for (const [path, value] of Object.entries(files)) {
    const key = keyOf(path);
    if (!accept(path) || typeof value !== 'string' || keys.has(key)) throw Error('存在不兼容的文件路径或内容：' + path);
    keys.add(key);
  }
  return files;
}
// 远端正文保留原名，同时修改的本机正文保存为同目录副本。
function merge(base, local, remote, accept = validPath) {
  const result = {}, conflicts = [];
  const paths = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const reserved = new Set([...paths].map(keyOf));
  for (const path of paths) {
    const a = local[path], b = remote[path], old = base[path];
    let value = b;
    if (a === b || b === old) value = a;
    else if (a !== old) {
      value = b ?? a;
      if (a !== undefined && b !== undefined) {
        let i = 1, copy;
        const slash = path.lastIndexOf('/') + 1;
        do { copy = path.slice(0, slash) + path.slice(slash, -3).slice(0, 60) + '（本机副本 ' + i++ + '）.md'; }
        while (reserved.has(keyOf(copy)) && !(remote[copy] === a && (local[copy] === undefined && base[copy] === undefined || local[copy] === a)));
        reserved.add(keyOf(copy));
        result[copy] = a;
      }
      conflicts.push(path);
    }
    if (value !== undefined) result[path] = value;
  }
  return { files: validate(result, accept), conflicts };
}
module.exports = { ROOT, folders, validPath, validMarkdownPath, validate, merge };
