import type { Dictionary } from "./dictionaries/ar";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Dictionary>;
export type Values = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: Values) => string;

export function createTranslator(dictionary: Dictionary): Translate {
  return (key, values) => {
    let node: unknown = dictionary;
    for (const part of key.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof node !== "string") {
      return key;
    }
    if (!values) {
      return node;
    }
    return node.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}
