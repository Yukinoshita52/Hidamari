const { EditorState, StateEffect, StateField } = require('@codemirror/state');
const { Decoration, EditorView } = require('@codemirror/view');
const { isLiteral } = require('./markdown');

const pendingAt = StateEffect.define();
const pendingQuote = StateField.define({
  create: () => null,
  update(pos, tr) {
    for (const effect of tr.effects) if (effect.is(pendingAt)) return effect.value;
    if (pos === null) return null;
    const mapped = tr.changes.mapPos(pos, 1);
    return tr.newDoc.sliceString(mapped, mapped + 2) === '\\>'
      ? mapped : null;
  },
  provide: field => EditorView.decorations.from(field, pos => pos === null ? Decoration.none :
    Decoration.set([Decoration.replace({}).range(pos, pos + 1)]))
});

function quoteExtension(isMarkdown) {
  return [pendingQuote, EditorState.transactionFilter.of(tr => {
    const state = tr.startState;
    if (state.readOnly || !tr.isUserEvent('input.type') || tr.changes.empty ||
        state.selection.ranges.length !== 1 || tr.newSelection.ranges.length !== 1 ||
        !tr.newSelection.main.empty || !isMarkdown(state)) return tr;
    const cursor = tr.newSelection.main.head;
    let input, source;
    tr.changes.iterChanges((from, to, start, end, inserted) => {
      if (end === cursor && inserted.lines === 1) {
        input = inserted.toString();
        source = from;
      }
    });
    if (!input || !/[>》 ]$/.test(input) || isLiteral(state, source)) return tr;
    const line = tr.newDoc.lineAt(cursor);
    const prefix = tr.newDoc.sliceString(line.from, cursor);
    const pending = state.field(pendingQuote);
    if (input === ' ' && pending !== null && source === pending + 2 && prefix.endsWith('\\> ')) {
      return [tr, { sequential: true, changes: { from: cursor - 3, to: cursor - 2 } }];
    }
    const marker = /^ {0,3}(?:>[ \t]{0,4})*([>》] ?)$/.exec(prefix);
    if (!marker) return tr;
    const from = cursor - marker[1].length;
    if (marker[1] === '》 ' && input.endsWith(' ')) {
      return [tr, { sequential: true, changes: { from, to: from + 1, insert: '>' } }];
    }
    // 半角符号本身即可触发 Markdown 引用。输入空格前用转义保存字面含义。
    if (marker[1] === '>' && input.endsWith('>')) {
      return [tr, { sequential: true, changes: { from, insert: '\\' }, effects: pendingAt.of(from) }];
    }
    return tr;
  })];
}

function removeQuoteMarker(view, line, cursor) {
  const { state } = view;
  const pending = state.field(pendingQuote, false);
  if (pending != null && cursor === pending + 2) {
    view.dispatch({ changes: { from: pending, to: cursor }, selection: { anchor: pending }, userEvent: 'delete.backward' });
    return true;
  }
  const prefix = line.text.slice(0, cursor - line.from);
  const quote = /^( {0,3}(?:>[ \t]{0,4})*)>[ \t]?$/.exec(prefix);
  if (quote && !isLiteral(state, cursor - 1)) {
    const from = line.from + quote[1].length;
    const to = cursor + (prefix.endsWith('>') && /^[ \t]/.test(line.text.slice(prefix.length)) ? 1 : 0);
    view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: 'delete.backward' });
    return true;
  }
  return false;
}

module.exports = { removeQuoteMarker, quoteExtension };
