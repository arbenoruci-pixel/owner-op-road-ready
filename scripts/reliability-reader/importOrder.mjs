// Next.js requires module directives before imports, including after a second
// materializer pass. Repair only a leading block of imports/comments.
export function moduleDirectiveFirst(source) {
  const directive = /^(['"])use (client|server)\1;?[ \t]*(?:\r?\n|$)/m.exec(source);
  if (!directive || directive.index === 0) return source;
  const prefix = source.slice(0, directive.index);
  const remaining = prefix.replace(/^import\b[\s\S]*?;[ \t]*(?:\r?\n|$)/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '').trim();
  if (remaining) throw Error('Module directive appears after executable code.');
  return directive[0].trimEnd() + '\n' + prefix + source.slice(directive.index + directive[0].length);
}

export function prependModuleImport(source, line) {
  source = moduleDirectiveFirst(source);
  const directive = /^(['"])use (client|server)\1;?[ \t]*(?:\r?\n|$)/.exec(source);
  return directive ? directive[0] + line + '\n' + source.slice(directive[0].length) : line + '\n' + source;
}
