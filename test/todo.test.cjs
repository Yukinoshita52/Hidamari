const { test } = require('node:test');
const assert = require('node:assert/strict');
const { keymap } = require('@codemirror/view');
const { EditorState, Transaction } = require('@codemirror/state');
const { todoExtension } = require('../src/editor/todo');

function enter(before, input, { markdown = true, event = 'input.type', after = '' } = {}) {
  let state = EditorState.create({ doc: before + after, selection: { anchor: before.length },
    extensions: [todoExtension(() => markdown)] });
  for (const text of input) {
    const pos = state.selection.main.head;
    state = state.update({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length },
      annotations: Transaction.userEvent.of(event) }).state;
  }
  return [state.doc.toString(), state.selection.main.head];
}
test('四种空括号写法只在输入空格时展开', () => {
  for (const marker of ['[]', '【】', '- []', '-【】']) {
    assert.deepEqual(enter('', marker), [marker, marker.length]);
    assert.deepEqual(enter('', marker + ' 事项'), ['- [ ] 事项', 8]);
  }
  assert.deepEqual(enter('', ['【】 '], { event: 'input.type.compose', after: '已有文字' }), ['- [ ] 已有文字', 6]);
});
test('列表保留缩进，段落末尾新起一项', () => {
  assert.deepEqual(enter('  - ', '[] '), ['  - [ ] ', 8]);
  assert.deepEqual(enter('段落 ', '-【】 '), ['段落\n- [ ] ', 9]);
});
test('旧指令、普通正文、粘贴和非 Markdown 输入保留原文', () => {
  for (const literal of ['/todo ', '取数组[] ', '【正文】 ', '- [x] ']) {
    assert.equal(enter('', literal)[0], literal);
  }
  assert.equal(enter('', ['[] '], { event: 'input.paste' })[0], '[] ');
  assert.equal(enter('', '[] ', { markdown: false })[0], '[] ');
});

function backspace(doc, selection) {
  let state = EditorState.create({ doc, selection, extensions: [todoExtension(() => true)] });
  const binding = state.facet(keymap).flat().find(b => b.key === 'Backspace');
  const handled = binding.run({ state, dispatch(spec) { state = state.update(spec).state; } });
  return [handled, state.doc.toString(), state.selection.main.head];
}

test('Backspace 仅在紧跟待办标记时整块删除，保留正文、引用和换行', () => {
  const doc = '上文\n>   - [ ] 正文\n下文';
  const cursor = doc.indexOf('正文');
  assert.deepEqual(backspace(doc, { anchor: cursor }), [true, '上文\n>   正文\n下文', cursor - 6]);
  assert.equal(backspace(doc, { anchor: cursor + 1 })[0], false);
  assert.equal(backspace(doc, { anchor: cursor, head: cursor + 1 })[0], false);
});

test('Backspace 在无序列表正文开头移除整个标记', () => {
  for (const [prefix, bullet, body] of [
    ['', '- ', '业务价值'], ['  ', '* ', '子项'], ['> ', '+ ', '引用'],
    ['', '- ', ''], ['', '-  ', '两个空格'], ['', '+\t', '制表符']
  ]) {
    const before = '上文\n' + prefix;
    const doc = before + bullet + body + '\n下文';
    assert.deepEqual(backspace(doc, { anchor: before.length + bullet.length }),
      [true, before + body + '\n下文', before.length]);
  }
});

test('正文内部、分隔线、普通有序列表及待办框前沿用原生退格', () => {
  for (const [doc, anchor] of [
    ['- 业务', 3], ['- - -', 2], ['> * * *', 4], ['1. 业务', 3],
    ['- [ ] 待办', 2], ['-   业务', 2], ['正文 - 业务', 5]
  ]) {
    assert.deepEqual(backspace(doc, { anchor }), [false, doc, anchor]);
  }
});
