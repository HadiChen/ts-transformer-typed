import type * as Ts from 'typescript';
import {
  createProgram,
  ScriptTarget,
  transpileModule,
  transform,
  transpile,
  ModuleKind,
  forEachChild,
  isTypeAliasDeclaration,
  createPrinter,
} from 'typescript';
import transformer from './transformer';

export function compile(filePaths: string[], writeFileCallback?: Ts.WriteFileCallback) {
  const program = createProgram(filePaths, {
    strict: true,
    noEmitOnError: true,
    suppressImplicitAnyIndexErrors: true,
    target: ScriptTarget.ES5,
  });
  const transformers: Ts.CustomTransformers = {
    before: [transformer(program)],
    after: [],
  };

  const sourceFile = program.getSourceFile(filePaths[0]);
  const res = transform(sourceFile!, [
    transformer(program),
  ]);
  const printer = createPrinter();
  /**
   * printFile 能获取转换后的代码
   *
   * 相当于 program.emit
   */
  const r = printer.printFile(res.transformed[0]);
  console.log(5, r);

  // const xx = transpile(res.transformed[0].text, {
  //   target: ScriptTarget.ESNext,
  //   module: ModuleKind.CommonJS,
  // });
  // const checker = program.getTypeChecker();
  // forEachChild(sourceFile!, (node) => {
  //   const symbol = checker.getSymbolAtLocation(node);

  //   console.log(11, node.kind, isTypeAliasDeclaration(node));

  //   if (symbol) {
  //     const type = checker.getDeclaredTypeOfSymbol(symbol);
  //     console.log(22, type, symbol);
  //   }
  //   const properties = checker.getPropertiesOfType(checker.getTypeAtLocation(node));
  //   properties.forEach((declaration) => {
  //     console.log(33, declaration.name);
  //   });
  // });

  const {
    emitSkipped,
    diagnostics,
  } = program.emit(undefined, writeFileCallback, undefined, false, transformers);

  if (emitSkipped) {
    throw new Error(diagnostics.map(diagnostic => diagnostic.messageText).join('\n'));
  }
}
