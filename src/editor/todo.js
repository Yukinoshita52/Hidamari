const { EditorState, Prec } = require('@codemirror/state');
const { EditorView, keymap } = require('@codemirror/view');
const { syntaxTree } = require('@codemirror/language');

function isLiteral(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (/codeblock|code[-_]?block|inlinecode|inline[-_]?code|frontmatter|hmd-code|inline-code/i.test(node.name)) return true;
  }
  return false;
}

function removeCheckbox(view, isMarkdown) {
  const { state } = view;
  const { main, ranges } = state.selection;
  if (view.composing || state.readOnly || ranges.length !== 1 || !main.empty || !isMarkdown(state)) return false;
  const line = state.doc.lineAt(main.head);
  const prefix = state.sliceDoc(line.from, main.head);
  const match = /^([ \t]*(?:>[ \t]*)*)(?:[-+*]|\d+[.)]) \[[ xX]\] $/.exec(prefix);
  if (!match || isLiteral(state, main.head - 1)) return false;

  const from = line.from + match[1].length;
  view.dispatch({ changes: { from, to: main.head }, selection: { anchor: from }, userEvent: 'delete.backward' });
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
  const backspace = view => removeCheckbox(view, isMarkdown);
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
