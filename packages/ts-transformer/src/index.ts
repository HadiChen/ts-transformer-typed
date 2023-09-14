import * as Ts from 'typescript';
import { transformer } from './transformer';
import { first } from 'lodash-es';

const printer = Ts.createPrinter();

const createProgram = (filePath: string | string[]) => {
  const filePaths = Array.isArray(filePath) ? filePath : [filePath];

  return Ts.createProgram(filePaths, {
    strict: true,
    noEmitOnError: true,
    suppressImplicitAnyIndexErrors: true,
    /**
     * ts@5.5 将抛弃 `suppressImplicitAnyIndexErrors`
     */
    ignoreDeprecations: '5.0',
    target: Ts.ScriptTarget.ES5,
  });
};

interface TransformOpts {
  sourceFile: Ts.SourceFile | Ts.SourceFile[];
  compilerOptions?: Ts.CompilerOptions;
}

const transformFile = (program: Ts.Program, transformOpts: TransformOpts) => {
  const { sourceFile, compilerOptions } = transformOpts;
  const { transformed } = Ts.transform(sourceFile!, [
    transformer(program),
  ], compilerOptions);

  return printer.printFile(first(transformed));
};

export const compileByFile = (filePath: string) => {
  const program = createProgram(filePath);
  const sourceFile = program.getSourceFile(filePath);

  return transformFile(program, {
    sourceFile,
  });
};

export const compileCode = (code: string, filePath: string) => {
  const program = createProgram(filePath);
  const sourceFile = Ts.createSourceFile(filePath, code, Ts.ScriptTarget.ESNext);

  return transformFile(program, {
    sourceFile,
  });
  // const { outputText } = Ts.transpileModule(code, {
  //   transformers: {
  //     before: [
  //       transformer(program),
  //     ],
  //   },
  // });
  // return outputText;

  // return transformFile(program, {
  //   sourceFile,
  // });
};

function main() {
  const code = `
    interface Foo {
      a?: string;
      b: number
    }

    const foo = typedData<Foo>();
    console.log(foo)
  `;
  console.log(444, compileCode(code, 'xxx.ts'));
}

main();
