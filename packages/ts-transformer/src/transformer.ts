import * as Ts from 'typescript';
import * as path from 'node:path';
import { isUndefined } from 'lodash-es';
import { getProperties } from './get-properties';

export interface Property {
  name: string;
  modifiers: string[];
  optional: boolean;
  type: string | string[];
  elementKeys?: string[];
  elementType?: any;
}

const symbolMap = new Map<string, Ts.Symbol>();
const indexTs = path.join(__dirname, './index.ts');

const isKeysCallExpression = (node: Ts.Node, typeChecker: Ts.TypeChecker): node is Ts.CallExpression => {
  if (!Ts.isCallExpression(node)) {
    return false;
  }
  const signature = typeChecker.getResolvedSignature(node);
  if (isUndefined(signature)) {
    return false;
  }

  const { declaration } = signature;
  return !!declaration
    && !Ts.isJSDocSignature(declaration)
    && (path.join(declaration.getSourceFile().fileName) === indexTs)
    && !!declaration.name
    && declaration.name.getText() === 'typedData';
};

export const transformer = (program: Ts.Program) => {
  const visitNode = (node: Ts.Node, program: Ts.Program) => {
    if (node.kind === Ts.SyntaxKind.SourceFile) {
      const locals = (node as any).locals || [];
      locals.forEach((symbol: Ts.Symbol, key: string) => {
        if (!symbolMap.has(key)) {
          symbolMap.set(key, symbol);
        }
      });
    }
    const typeChecker = program.getTypeChecker();
    if (!isKeysCallExpression(node, typeChecker)) {
      return node;
    }
    if (!(node as Ts.CallExpression).typeArguments) {
      return Ts.factory.createArrayLiteralExpression([]);
    }
    const type = typeChecker.getTypeFromTypeNode(node.typeArguments![0]);
    let properties: Property[] = [];

    const symbols = typeChecker.getPropertiesOfType(type);
    symbols.forEach((symbol) => {
      properties = [...properties, ...getProperties(symbol, symbolMap, [])];
    });

    const arrayLiteralExpression = Ts.factory.createArrayLiteralExpression(
      properties.map((property) => {
        return Ts.factory.createRegularExpressionLiteral(JSON.stringify(property));
      }),
    );
    return arrayLiteralExpression;
  };

  return (ctx: Ts.TransformationContext) => {
    return (sourceFile: Ts.SourceFile): Ts.SourceFile => {
      const visitor = (node: Ts.Node): Ts.Node => {
        return Ts.visitEachChild(visitNode(node, program), visitor, ctx);
      };
      const data = <Ts.SourceFile>Ts.visitEachChild(visitNode(sourceFile, program), visitor, ctx);
      return data;
    };
  };
};
