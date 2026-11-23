const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorView, keymap } = require('@codemirror/view');
const { EditorState, Transaction } = require('@codemirror/state');
const { todoExtension } = require('../src/editor/todo');

const { quoteExtension } = require('../src/editor/quote');

function enter(before, input, { markdown = true, event = 'input.type', after = '' } = {}) {
  let state = EditorState.create({ doc: before + after, selection: { anchor: before.length },
    extensions: [todoExtension(() => markdown), quoteExtension(() => markdown)] });
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

test('有序列表可在编号后或正文开头一次退格，保留缩进和相邻列表项', () => {
  for (const [prefix, marker, body, offset] of [
    ['', '2.', '', 2], ['', '2. ', '', 3], ['', '2. ', '', 2],
    ['', '10. ', '事项', 4], ['  ', '12)  ', '子项', 3],
    ['> ', '3)\t', '引用', 3], ['', '1. [x] ', '完成', 7]
  ]) {
    const before = '1. 上一项\n' + prefix;
    const after = body + '\n3. 下一项';
    assert.deepEqual(backspace(before + marker + after, { anchor: before.length + offset }),
      [true, before + after, before.length]);
  }
});

test('正文内部、分隔线、小数和待办框前沿用原生退格', () => {
  for (const [doc, anchor] of [
    ['- 业务', 3], ['- - -', 2], ['> * * *', 4], ['1. 业务', 4],
    ['2.5', 2], ['正文 2.', 5], ['1. [ ] 待办', 3], ['1234567890. ', 12],
    ['- [ ] 待办', 2], ['-   业务', 2], ['正文 - 业务', 5]
  ]) {
    assert.deepEqual(backspace(doc, { anchor }), [false, doc, anchor]);
  }
});

test('引用标记后一次退格只移除当前层，保留正文和换行', () => {
  for (const [prefix, marker, body] of [
    ['', '> ', '正文'], ['', '> ', ''], ['  ', '> ', '  正文'], ['> ', '> ', '嵌套'], ['', '>\t', '列表']
  ]) {
    const before = '上一行\n' + prefix;
    const after = body + '\n下一行';
    assert.deepEqual(backspace(before + marker + after, { anchor: before.length + marker.length }),
      [true, before + after, before.length]);
  }
  assert.equal(backspace('正文 > 引号', { anchor: 5 })[0], false);
  assert.equal(backspace('> 引用', { anchor: 3 })[0], false);
});

test('行首的半角和全角引用标记要等空格才生效', () => {
  assert.deepEqual(enter('', '>'), ['\\>', 2]);
  assert.deepEqual(enter('', '》'), ['》', 1]);
  for (const marker of ['>', '》']) {
    assert.deepEqual(enter('', marker + ' ', { after: '正文' }), ['> 正文', 2]);
    assert.deepEqual(enter('> ', marker + ' 内层'), ['> > 内层', 6]);
  }
  assert.deepEqual(enter('', ['》 '], { event: 'input.type.compose' }), ['> ', 2]);
  assert.deepEqual(enter('正文', '> '), ['正文> ', 4]);
  assert.deepEqual(enter('\\', '> '), ['\\> ', 3]);
  assert.deepEqual(enter('', '》 ', { markdown: false }), ['》 ', 2]);
  assert.deepEqual(enter('', ['》 '], { event: 'input.paste' }), ['》 ', 2]);
});

test('半角引用确认前只显示原字符，一次退格可清除整个输入', () => {
  let state = EditorState.create({ extensions: [todoExtension(() => true), quoteExtension(() => true)] });
  state = state.update({ changes: { from: 0, insert: '>' }, selection: { anchor: 1 }, userEvent: 'input.type' }).state;
  const hidden = [];
  for (const set of state.facet(EditorView.decorations)) {
    set.between(0, state.doc.length, (from, to) => hidden.push(state.sliceDoc(from, to)));
  }
  assert.deepEqual(hidden, ['\\']);
  const binding = state.facet(keymap).flat().find(b => b.key === 'Backspace');
  assert.equal(binding.run({ state, dispatch(spec) { state = state.update(spec).state; } }), true);
  assert.deepEqual([state.sliceDoc(), state.selection.main.head], ['', 0]);
});
