const { syntaxTree } = require('@codemirror/language');

function isLiteral(state, pos, extra) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (/codeblock|code[-_]?block|inlinecode|inline[-_]?code|frontmatter|hmd-code|inline-code/i.test(node.name) || extra?.test(node.name)) return true;
  }
  return false;
}

module.exports = { isLiteral };
