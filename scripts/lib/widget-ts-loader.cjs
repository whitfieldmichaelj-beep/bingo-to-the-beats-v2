/* eslint-disable @typescript-eslint/no-require-imports -- Webpack loads this CommonJS loader. */
const ts = require('typescript');
module.exports = function(source) {
  if (this.resourcePath.endsWith('.css')) return '';
  return ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, fileName: this.resourcePath }).outputText;
};
