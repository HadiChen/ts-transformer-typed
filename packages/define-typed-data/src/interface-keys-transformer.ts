import * as Ts from 'typescript';
import {
  createProgram,
  ScriptTarget,
  transform,
  createPrinter,
  transpileModule,
  createSourceFile,
  CreateSourceFileOptions,
} from 'typescript';
import transformer from './transformer';

export function compile(filePaths: string[], writeFileCallback?: Ts.WriteFileCallback) {
  const program = createProgram(filePaths, {
    strict: true,
    noEmitOnError: true,
    suppressImplicitAnyIndexErrors: true,
    /**
     * ts@5.5 将抛弃 `suppressImplicitAnyIndexErrors`
     */
    ignoreDeprecations: '5.0',
    target: ScriptTarget.ES5,
  });
  const transformers: Ts.CustomTransformers = {
    before: [transformer(program)],
    after: [],
  };

  const code = `
    interface Foo {
      a?: string;
      b: number
    }

    const foo = typedData<Foo>();

    const dfn = () => {
      document.title = foo.a || '';
      return foo;
    }
  `;
  const printer = createPrinter();
  // const { transformed } = transform(sourceFile!, [
  //   transformer(program),
  // ]);
  // const { outputText } = transpileModule(code, {
  //   transformers: {
  //     before: [
  //       transformer(program),
  //     ],
  //   },
  // });

  // console.log(outputText);

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

  const sourceFile = createSourceFile('xx.ts', code, {
    languageVersion: Ts.ScriptTarget.ESNext,
  });
  // const sourceFile = program.getSourceFile(filePaths[0]);
  const res = transform(sourceFile!, [
    transformer(program),
  ]);
  const r = printer.printFile(res.transformed[0]);
  console.log(5, r);

  if (emitSkipped) {
    throw new Error(diagnostics.map(diagnostic => diagnostic.messageText).join('\n'));
  }
}
