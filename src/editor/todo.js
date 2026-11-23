const { EditorState, Prec } = require('@codemirror/state');
const { EditorView, keymap } = require('@codemirror/view');
const { removeQuoteMarker } = require('./quote');
const { isLiteral } = require('./markdown');

function removeBlockMarker(view, isMarkdown) {
  const { state } = view;
  const { main, ranges } = state.selection;
  if (view.composing || state.readOnly || ranges.length !== 1 || !main.empty || !isMarkdown(state)) return false;
  const line = state.doc.lineAt(main.head);
  if (removeQuoteMarker(view, line, main.head)) return true;
  const match = /^([ \t]*(?:>[ \t]*)*)(?:(?:[-+*]|\d+[.)]) \[[ xX]\] |[-+*][ \t]+|(\d{1,9}[.)])(?:[ \t]+|$))/.exec(line.text);
  if (!match) return false;
  const from = line.from + match[1].length;
  const to = line.from + match[0].length;
  const afterNumber = match[2] && main.head === from + match[2].length;
  if ((main.head !== to && !afterNumber) || isLiteral(state, main.head - 1)) return false;
  // 带空格的 Markdown 分隔线可能与无序列表有相同的开头。
  if (/^([-*])(?:[ \t]*\1){2,}[ \t]*$/.test(line.text.slice(match[1].length))) return false;

  view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: 'delete.backward' });
  return true;
}

// 在同一笔输入事务内展开，让原生撤销、光标和 Markdown 保存沿用编辑器行为。
function todoExtension(isMarkdown) {
  const expand = EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged || !tr.isUserEvent('input.type') || tr.changes.empty ||
        tr.newSelection.ranges.length !== 1 || !tr.newSelection.main.empty || !isMarkdown(tr.startState)) return tr;

    const cursor = tr.newSelection.main.head;
    const line = tr.newDoc.lineAt(cursor);
    const prefix = tr.newDoc.sliceString(line.from, cursor);
    const marker = /(?:- ?)?(?:\[\]|【】) $/.exec(prefix);
    if (!marker) return tr;

    let typed = false, sourcePos;
    tr.changes.iterChanges((from, to, start, end, inserted) => {
      if (end === cursor && inserted.lines === 1 && inserted.toString().endsWith(' ')) {
        typed = true;
        sourcePos = from;
      }
    });
    if (!typed) return tr;
    if (isLiteral(tr.startState, sourcePos)) return tr;

    const before = prefix.slice(0, marker.index);
    let from = line.from + marker.index, insert = '- [ ] ';
    const list = before.match(/^([ \t]*(?:> ?)*[ \t]*)(?:[-*+] |\d+[.)] )?$/);
    if (list) {
      from = line.from + list[1].length;
    } else if (/\s$/.test(before)) {
      from -= before.length - before.trimEnd().length;
      insert = '\n' + insert;
    } else return tr;
    return [tr, { sequential: true, changes: { from, to: cursor, insert }, selection: { anchor: from + insert.length } }];
  });
  const backspace = view => removeBlockMarker(view, isMarkdown);
  return [
    expand,
    Prec.highest(keymap.of([{ key: 'Backspace', run: backspace }])),
    Prec.highest(EditorView.domEventHandlers({
      beforeinput(event, view) {
        return event.cancelable && !event.isComposing && event.inputType === 'deleteContentBackward' && backspace(view);
      }
    }))
  ];
}
module.exports = { todoExtension };
