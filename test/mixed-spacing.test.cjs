const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { mixedSpacing } = require('../src/editor/mixed-spacing');

function editor(doc, markdown = true) {
  let plugin;
  const view = {
    state: EditorState.create({ doc, selection: { anchor: doc.length } }),
    dispatch(spec) {
      const tr = this.state.update(spec);
      this.state = tr.state;
      plugin.update({ transactions: [tr] });
    }
  };
  plugin = mixedSpacing(() => markdown).create(view);
  return {
    view,
    type(text, from = view.state.selection.main.head, to = from, event = 'input.type') {
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: event });
    },
    flush() { plugin.flush(); return view.state.doc.toString(); }
  };
}

test('输入法确认后才给「现在 AI 发展」补空格，光标继续跟随正文', () => {
  const e = editor('现在');
  e.view.compositionStarted = true;
  e.type('AI');
  assert.equal(e.flush(), '现在AI');
  e.view.compositionStarted = false;
  assert.equal(e.flush(), '现在 AI');
  assert.equal(e.view.state.selection.main.head, 5);
  e.view.compositionStarted = true;
  e.type('fa zhan');
  assert.equal(e.flush(), '现在 AIfa zhan');
  e.type('发展', 5, 12, 'input.type.compose');
  e.view.compositionStarted = false;
  assert.equal(e.flush(), '现在 AI 发展');
  assert.equal(e.view.state.selection.main.head, 8);
});

test('只处理新输入的汉字和英文字母交界，保留已有空格和标点', () => {
  const e = editor('旧AI。现状');
  e.type('AI', 5);
  assert.equal(e.flush(), '旧AI。现 AI 状');
  assert.equal(e.view.state.selection.main.head, 8);
  for (const [input, expected] of [
    ['𠀀AI发展', '𠀀 AI 发展'], ['现在 AI 发展', '现在 AI 发展'], ['现在，AI。', '现在，AI。'], ['第2章', '第2章']
  ]) {
    const entry = editor('');
    entry.type(input);
    assert.equal(entry.flush(), expected);
  }
});

test('取消输入法选词、粘贴和非 Markdown 编辑保留原文', () => {
  const e = editor('中文');
  e.view.compositionStarted = true;
  e.type('AI');
  e.type('', 2, 4, 'input.type.compose');
  e.view.compositionStarted = false;
  assert.equal(e.flush(), '中文');
  e.type('AI中文', 2, 2, 'input.paste');
  assert.equal(e.flush(), '中文AI中文');
  const other = editor('中文', false);
  other.type('AI');
  assert.equal(other.flush(), '中文AI');
});
