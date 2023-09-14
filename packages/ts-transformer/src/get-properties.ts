import * as Ts from 'typescript';
import { flattenDeep, some, isFunction } from 'lodash-es';

export interface Property {
  name: string;
  modifiers: string[];
  optional: boolean;
  type: string | string[];
  elementKeys?: string[];
  elementType?: any;
}

type PropertiesTransformer <R = Property> = (p: Property) => R;

const getPropertyType = (symbol: any): string => {
  if (symbol.intrinsicName) {
    return symbol.intrinsicName;
  }
  if ((symbol as Ts.UnionOrIntersectionTypeNode).types) {
    return symbol.types
      .map((token: any) => getPropertyType(token));
  }
  switch (symbol.kind) {
    case Ts.SyntaxKind.ArrayType:
      return 'array';
    case Ts.SyntaxKind.StringKeyword:
      return 'string';
    case Ts.SyntaxKind.NumberKeyword:
      return 'number';
    case Ts.SyntaxKind.BooleanKeyword:
      return 'boolean';
    case Ts.SyntaxKind.FunctionType:
      return 'Function';
    case Ts.SyntaxKind.TypeReference:
      return symbol.typeName.escapedText;
    case Ts.SyntaxKind.AnyKeyword:
      return 'any';
    case Ts.SyntaxKind.NullKeyword:
      return 'null';
    case Ts.SyntaxKind.ObjectKeyword:
      return 'object';
    case Ts.SyntaxKind.TypeLiteral:
      return 'object';
    case Ts.SyntaxKind.UnionType:
      return symbol.types.map((token: Ts.Token<Ts.SyntaxKind>) => getPropertyType(token));
    case Ts.SyntaxKind.IntersectionType:
      return symbol.types.map((token: any) => getPropertyType(token));
    default:
      return 'unknown';
  }
};
const getModifierType = (modifier: Ts.Modifier): string => {
  switch (modifier.kind) {
    case Ts.SyntaxKind.ReadonlyKeyword:
      return 'readonly';
    default:
      return 'unknown';
  }
};

export function getProperties<R = Property>(
  _symbol: Ts.Symbol,
  _symbolMap: Map<string, Ts.Symbol>,
  _outerLayerProperties: Property[],
  propertiesTransformer?: PropertiesTransformer<R>,
) {
  function getPropertiesOfSymbol(
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
    /**
     * 由于 interface 或 type 可以是交叉类型（例如 A & B）
     * 或联合类型（例如 A | B），这些类型没有 `valueDeclaration` 属性
     * 所以必须遍历 `symbol.declarations` 来收集所有子类型的 `questionToken`
     */
    const optional = some(symbol.declarations, (declaration: Ts.PropertyDeclaration) => {
      return !!declaration.questionToken;
    });
    const modifiers: string[] = [];

    symbol.declarations?.forEach((declaration: Ts.Declaration) => {
      if (Ts.canHaveModifiers(declaration)) {
        const _modifiers = Ts.getModifiers(declaration);

        if (_modifiers.length) {
          _modifiers.forEach((modifier) => {
            modifiers.push(getModifierType(modifier));
          });
        }
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

    if (symbol.valueDeclaration && declaration.type.kind === Ts.SyntaxKind.ArrayType) {
      /** 处理 array: ...[] */
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
      // 处理 Array<...>
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

    const propertiesOfSymbol = getPropertiesOfSymbol(symbol, propertyPathElements, symbolMap);

    properties = [
      ...properties,
      ...propertiesOfSymbol,
    ];

    return properties;
  }

  const propertiesData = getSymbolProperties(
    _symbol,
    _outerLayerProperties,
    _symbolMap,
  );

  if (isFunction(propertiesTransformer)) {
    return propertiesData.map(p => propertiesTransformer(p));
  }
  return propertiesData;
}
