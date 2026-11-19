const { ViewPlugin } = require('@codemirror/view');
const { isLiteral } = require('./markdown');

const han = /\p{Script=Han}/u;
const english = /[A-Za-z]/;
const linkOrTag = /url|link-href|internal-link|wikilink|hashtag/i;

function spacesForInput(state, original, typed) {
  const spaces = [];
  typed.iterChanges((oldFrom, oldTo, from, to, inserted) => {
    if (!inserted.length || original.sliceString(oldFrom, oldTo) === inserted.toString()) return;
    const start = Math.max(0, from - 2);
    const around = state.sliceDoc(start, Math.min(state.doc.length, to + 2));
    let pos = start, previous = '';
    for (const current of around) {
      if (pos >= from && pos <= to &&
          ((han.test(previous) && english.test(current)) || (english.test(previous) && han.test(current))) &&
          !isLiteral(state, pos, linkOrTag)) {
        spaces.push({ from: pos, insert: ' ' });
      }
      pos += current.length;
      previous = current;
    }
  });
  return spaces;
}

function mixedSpacing(isMarkdown) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.view = view; }

    update(update) {
      for (const tr of update.transactions) {
        if (!tr.docChanged || tr.isUserEvent('input.type.spacing')) continue;
        if (!tr.isUserEvent('input.type') || tr.newSelection.ranges.length !== 1 ||
            !isMarkdown(tr.startState) || tr.startState.readOnly) {
          this.clear();
          continue;
        }
        if (!this.pending) this.original = tr.startState.doc;
        this.pending = this.pending ? this.pending.compose(tr.changes) : tr.changes;
        this.schedule();
      }
    }

    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.view.compositionStarted ? 80 : 0);
    }

    flush() {
      const { view, original, pending } = this;
      if (!pending) return;
      // 原生 EditContext 的组合结束事件可能只送给输入上下文，保留延迟检查。
      if (view.compositionStarted) { this.schedule(); return; }
      this.clear();
      if (view.state.readOnly || !isMarkdown(view.state)) return;
      const changes = spacesForInput(view.state, original, pending);
      if (changes.length) view.dispatch({ changes, userEvent: 'input.type.spacing' });
    }

    clear() {
      clearTimeout(this.timer);
      this.pending = this.original = null;
    }

    destroy() { this.clear(); }
  }, {
    eventObservers: {
      compositionend() { if (this.pending) this.schedule(); }
    }
  });
}

module.exports = { mixedSpacing };
