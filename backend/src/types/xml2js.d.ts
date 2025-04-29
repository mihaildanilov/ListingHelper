declare module 'xml2js' {
  export interface ParserOptions {
    mergeAttrs?: boolean;
    [key: string]: any;
  }

  export class Parser {
    constructor(options?: ParserOptions);
    parseStringPromise(str: string): Promise<any>;
  }

  export function parseString(
    str: string,
    options: ParserOptions,
    callback: (err: Error | null, result: any) => void,
  ): void;
}
