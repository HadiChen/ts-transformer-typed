import type * as Ts from 'typescript';
import path from 'node:path';
import {
  visitEachChild,
  SyntaxKind,
  isCallExpression,
  isJSDocSignature,
  factory,
} from 'typescript';
import { some, flattenDeep } from 'lodash-es';

interface Property {
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
  if (!isCallExpression(node)) {
    return false;
  }
  const signature = typeChecker.getResolvedSignature(node);
  if (typeof signature === 'undefined') {
    return false;
  }
  const { declaration } = signature;
  return !!declaration
    && !isJSDocSignature(declaration)
    && (path.join(declaration.getSourceFile().fileName) === indexTs)
    && !!declaration.name
    && declaration.name.getText() === 'typedData';
};

const getModifierType = (modifier: Ts.Token<Ts.SyntaxKind>): string => {
  switch (modifier.kind) {
    case SyntaxKind.ReadonlyKeyword:
      return 'readonly';
    default:
      return 'unknown';
  }
};

const getPropertyType = (symbol: any): string => {
  if (symbol.intrinsicName) {
    return symbol.intrinsicName;
  }
  if ((symbol as Ts.UnionOrIntersectionTypeNode).types) {
    return symbol.types
      .map((token: any) => getPropertyType(token));
  }
  switch (symbol.kind) {
    case SyntaxKind.ArrayType:
      return 'array';
    case SyntaxKind.StringKeyword:
      return 'string';
    case SyntaxKind.NumberKeyword:
      return 'number';
    case SyntaxKind.BooleanKeyword:
      return 'boolean';
    case SyntaxKind.FunctionType:
      return 'Function';
    case SyntaxKind.TypeReference:
      return symbol.typeName.escapedText;
    case SyntaxKind.AnyKeyword:
      return 'any';
    case SyntaxKind.NullKeyword:
      return 'null';
    case SyntaxKind.ObjectKeyword:
      return 'object';
    case SyntaxKind.TypeLiteral:
      return 'object';
    case SyntaxKind.UnionType:
      return symbol.types.map((token: Ts.Token<SyntaxKind>) => getPropertyType(token));
    case SyntaxKind.IntersectionType:
      return symbol.types.map((token: any) => getPropertyType(token));
    default:
      return 'unknown';
  }
};

function _getPropertiesOfSymbol(
  symbol: Ts.Symbol,
  propertyPathElements: Property[],
  symbolMap: Map<string, Ts.Symbol>,
): Property[] {
  const isOutermostLayerSymbol = (symbol: any): boolean => {
    return symbol.valueDeclaration && symbol.valueDeclaration.symbol.valueDeclaration.type.members;
  };

  const isInnerLayerSymbol = (symbol: any): boolean => {
    return symbol.valueDeclaration && symbol.valueDeclaration.symbol.valueDeclaration.type.typeName;
  };

  if (!isOutermostLayerSymbol(symbol) && !isInnerLayerSymbol(symbol)) {
    return [];
  }
  let properties: Property[] = [];
  let members: any;
  if ((<any>symbol.valueDeclaration).type.symbol) {
    members = (<any>symbol.valueDeclaration).type.members.map((member: any) => member.symbol);
  } else {
    const propertyTypeName = (<any>symbol.valueDeclaration).type.typeName.escapedText;
    const propertyTypeSymbol = symbolMap.get(propertyTypeName);
    if (propertyTypeSymbol) {
      if (propertyTypeSymbol.members) {
        members = propertyTypeSymbol.members;
      } else {
        members = (<any>propertyTypeSymbol).exportSymbol.members;
      }
    }
  }
  if (members) {
    members.forEach((member: any) => {
      properties = [
        ...properties,
        ...getSymbolProperties(member, propertyPathElements, symbolMap),
      ];
    });
  }

  return properties;
}

function getSymbolProperties(
  symbol: Ts.Symbol,
  outerLayerProperties: Property[],
  symbolMap: Map<string, Ts.Symbol>,
): Property[] {
  let properties: Property[] = [];
  const propertyPathElements = JSON.parse(JSON.stringify(outerLayerProperties.map(property => property)));
  const propertyName = symbol.escapedName;
  propertyPathElements.push(propertyName);
  /* please note: due to interface or type can be a intersection types (e.g. A & B)
   * or a union types (e.g. A | B), these types have no "valueDeclaration" property.
   * We must traverse the "symbol.declarations" to collect "questionToken" of all sub types
   */
  const optional = some(symbol.declarations, (declaration: Ts.PropertyDeclaration) => {
    return !!declaration.questionToken;
  });
  const modifiers: string[] = [];
  symbol.declarations?.forEach((declaration: any) => {
    if (declaration.modifiers) {
      declaration.modifiers.forEach((modifier: Ts.Token<Ts.SyntaxKind.ReadonlyKeyword>) => {
        modifiers.push(getModifierType(modifier));
      });
    }
  });
  const declaration = symbol.valueDeclaration as Ts.Declaration & Record<string, any>;
  const property: Property = {
    name: propertyPathElements.join('.'),
    modifiers,
    optional,
    type: getPropertyType(
      symbol.valueDeclaration
        ? declaration.type
        : (<any>symbol).type,
    ),
  };

  if (symbol.valueDeclaration && declaration.type.kind === SyntaxKind.ArrayType) {
    // array: []
    const elementType = getPropertyType(declaration.type.elementType);
    if (declaration.type.elementType.members) {
      property.elementKeys = flattenDeep(declaration.type?.elementType?.members.map((member: any) => {
        return getSymbolProperties(member.symbol, [], symbolMap);
      }));
    } else if ((<any>symbol).typeArguments /** typeArguments 为非标准定义 */) {
      const typeArguments = (<any>symbol).typeArguments as any[];
      property.elementKeys = flattenDeep(typeArguments?.[0].members.map((member: any) => {
        return getSymbolProperties(member.symbol, [], symbolMap);
      }));
    } else {
      const members = symbolMap.has(elementType)
        ? (symbolMap.get(elementType)!.declarations![0] as any).members
        : [];

      if (members && members.length > 0) {
        if (members?.map || Array.isArray(members)) {
          property.elementKeys = flattenDeep(members.map((member: any) => {
            return getSymbolProperties(member.symbol, [], symbolMap);
          }));
        }
      } else {
        property.elementType = elementType;
      }
    }
  } else if (symbol.valueDeclaration && declaration.type.typeArguments) {
    // for Array<xxx>
    let type;
    if (declaration.type.typeArguments[0].typeName) {
      type = declaration.type.typeArguments[0].typeName.escapedText;
    }
    const members = symbolMap.has(type)
      ? (symbolMap.get(type)!.declarations![0] as any).members
      : declaration.type.typeArguments[0].members;

    if (members?.map || Array.isArray(members)) {
      property.elementKeys = flattenDeep(members.map((member: any) => {
        return getSymbolProperties(member.symbol, [], symbolMap);
      }));
    }
  }
  properties.push(property);

  const propertiesOfSymbol = _getPropertiesOfSymbol(symbol, propertyPathElements, symbolMap);

  properties = [
    ...properties,
    ...propertiesOfSymbol,
  ];

  /**
   * TODO: 最后包装一层
   *
   * 接受处理函数即可转换位对应的输出数据
   */
  return properties.map((item) => {
    return item.name as any;
  });
}

const visitNode = (node: Ts.Node, program: Ts.Program): Ts.Node => {
  if (node.kind === SyntaxKind.SourceFile) {
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
    return factory.createArrayLiteralExpression([]);
  }
  const type = typeChecker.getTypeFromTypeNode(node.typeArguments![0]);
  let properties: Property[] = [];
  const symbols = typeChecker.getPropertiesOfType(type);
  symbols.forEach((symbol) => {
    properties = [...properties, ...getSymbolProperties(symbol, [], symbolMap)];
  });

  const arrayLiteralExpression = factory.createArrayLiteralExpression(
    properties.map(property => factory.createRegularExpressionLiteral(JSON.stringify(property))),
  );
  return arrayLiteralExpression;
};

const transformer = (
  program: Ts.Program,
) => {
  return (ctx: Ts.TransformationContext) => {
    return (sourceFile: Ts.SourceFile): Ts.SourceFile => {
      const visitor = (node: Ts.Node): Ts.Node => {
        return visitEachChild(visitNode(node, program), visitor, ctx);
      };
      const data = <Ts.SourceFile>visitEachChild(visitNode(sourceFile, program), visitor, ctx);
      return data;
    };
  };
};

export default transformer;
