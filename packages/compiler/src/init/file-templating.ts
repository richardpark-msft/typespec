import { camelCase, kebabCase, pascalCase } from "change-case";
import Mustache from "mustache";
import { getBaseFileName } from "../core/path-utils.js";
import type { InitTemplate } from "./init-template.js";
import type { ScaffoldingConfig } from "./scaffold.js";

export type FileTemplatingContext = Omit<InitTemplate, "libraries"> &
  ScaffoldingConfig & {
    /** Name of the folder */
    folderName: string;

    casing: CasingUtils;
    /**
     * NormalizeVersion function replaces `-` with `_`.
     */
    normalizeVersion: () => (text: string, render: any) => string;

    /**
     * toLowerCase function for template replacement
     */
    toLowerCase: () => (text: string, render: any) => string;

    /**
     * Normalize package name for languages other than C#. It replaces `.` with `-` and toLowerCase
     */
    normalizePackageName: () => (text: string, render: any) => string;

    // more lower level primitives, need to nest a few calls to get what we need.
    // Example, using a combo of slice and replace (and the existing toLowerCase)
    /*
      parameters.ServiceNamespace == "Azure.Messaging.EventGrid.SystemEvents"

      package-dir: "{{#toLowerCase}}az{{#slice}}-1, . {{parameters.ServiceNamespace}}{{/slice}}{{/toLowerCase}}"
      service-dir: "{{#toLowerCase}}{{#replace}}. / sdk/{{#slice}}1,-1 . {{parameters.ServiceNamespace}}{{/slice}}{{/replace}}{{/toLowerCase}}"

      becomes

      service-dir: "sdk/messaging/eventgrid"
      package-dir: "azsystemevents"
    */

    /**
     * Splits the text apart, based on delimiter, and then returns the segments (rejoined)
     * based on their slice indices.
     */
    slice: () => (text: string, render: any) => string;

    /**
     * Replaces the first instance of a substring with another string.
     */
    replace: () => (text: string, render: any) => string;

    // slightly higher level one that slices and dices. Saves us on some nested calls.    
    /*
      parameters.ServiceNamespace == "Azure.Messaging.EventGrid.SystemEvents"

      service-dir: "sdk/{{#toLowerCase}}{{#rejoin}}. / 1,-1 {{parameters.ServiceNamespace}}{{/rejoin}}{{/toLowerCase}}"
      package-dir: "az{{#toLowerCase}}{{#rejoin}}. / -1 {{parameters.ServiceNamespace}}{{/rejoin}}{{/toLowerCase}}"

      becomes

      service-dir: "sdk/messaging/eventgrid"
      package-dir: "azsystemevents"
    */

    /**
     * Splits text apart and rejoins specified segments using a new delimiter.
     */
    rejoin: () =>  (text: string, render: any) => string;


    /*
      Variations that take no additional parameters, other than the input text
    */

    /**
     * Splits a package string by '.' and returns only the final segment
     */
    lastSegment: () => (text: string, render: any) => string;

    /**
     * Splits a package string by '.' and returns only the middle segments (no leading or tail segment), joined by '.'.
     */
    middleSegments: () => (text: string, render: any) => string;

    /**
     * Takes the input text and replaces any '.' with '/'.
     */
    normalizeToPath: () => (text: string, render: any) => string;
  };

export interface CasingUtils {
  readonly camelCase: () => (text: string, render: (...args: any) => string) => string;
  readonly pascalCase: () => (text: string, render: (...args: any) => string) => string;
  readonly kebabCase: () => (text: string, render: (...args: any) => string) => string;
}

export function createFileTemplatingContext(config: ScaffoldingConfig): FileTemplatingContext {
  const folderName = getBaseFileName(config.directory);
  return {
    ...config.template,
    ...config,
    folderName,
    normalizeVersion,
    toLowerCase,
    normalizePackageName,
    slice,
    replace,
    rejoin,
    lastSegment,
    middleSegments,
    normalizeToPath,
    casing,
  };
}

export function render(content: string, context: FileTemplatingContext): string {
  return Mustache.render(content, context);
}

const casing: CasingUtils = {
  camelCase: createNamingUtils(camelCase),
  kebabCase: createNamingUtils(kebabCase),
  pascalCase: createNamingUtils(pascalCase),
};

function createNamingUtils(fn: (text: string) => string) {
  return () => (text: string, render: (...args: any) => string) => fn(render(text));
}

const normalizeVersion = function () {
  return function (text: string, render: any): string {
    return render(text).replaceAll("-", "_");
  };
};

const toLowerCase = function () {
  return function (text: string, render: any): string {
    return render(text).toLowerCase();
  };
};

const normalizePackageName = function () {
  return function (text: string, render: any): string {
    return render(text).replaceAll(".", "-").toLowerCase();
  };
};

// 
// 2. Lower level func, takes args
//

const slice = function () {
  return function (text: string, render: any): string {
    // we're assuming that the args are space separated and that the behavior here is
    // the same as the JavaScript slice function.
    //
    // 1st arg is the start-index,end-index
    // 2nd arg is the delimiter
    // 3rd arg is the string to split
    text = render(text);

    const args = text.split(" ", 3);

    if (args.length !== 3) {
      throw new Error(`split requires 3 arguments, got ${args.length} in "${text}"`);
    }

    const [start, end] = args[0].split(',', 2);

    const delimiter = args[1];
    const actualText = args[2];

    const endIdx: number | undefined = end !== "" ? parseInt(end, 10) : undefined;

    return actualText.split(delimiter)
      .slice(
        parseInt(start, 10), 
        endIdx)
      .join(delimiter);
  };
};

const replace = function () {
  return function (text: string, render: any): string {
    // we're assuming that the args are space separated and that the behavior here is
    // the same as the JavaScript slice function.
    //
    // 1st arg is the text to search for
    // 2nd arg is the text to replace it with
    // 3rd arg is the string to search and replace on.
    const args = render(text).split(" ", 3);

    if (args.length !== 3) {
      throw new Error(`replace requires 3 arguments, got ${args.length} in "${text}"`);
    }

    const [search, replace, actualText] = args;
    return actualText.replace(search, replace);
  };
};

// 
// 2. Higher level func, takes args
//

const rejoin = function () {
  return function (text: string, render: any): string {
    // we're assuming that the args are space separated and that the behavior, for indices, is
    // the same as the JavaScript slice function. 
    //
    // NOTE: since we use space as the delimiter for the 'args', we can't accept 'space' as 
    // a before/after delimiter. I believe this is going to be a rare case.
    //
    // 1st arg is the original delimiter
    // 2nd arg is the new delimiter, after rejoining
    // 3rd arg is the slice() compatible args for which segments to keep
    // 4th arg is the string to search and replace on.
    text = render(text);

    const args = text.split(" ", 4);

    if (args.length !== 4) {
      throw new Error(`split requires 4 arguments, got ${args.length} in "${text}"`);
    }

    const oldDelimiter = args[0];
    const newDelimiter = args[1];
    const [start, end] = args[2].split(',', 2);
    const actualText = args[3];

    const endIdx: number | undefined = end !== "" && end != null ? parseInt(end, 10) : undefined;

    return actualText.split(oldDelimiter)
      .slice(parseInt(start, 10), endIdx)
      .join(newDelimiter);
  };
}

// 
// 3. Argument-less primitives
//

const lastSegment = function () {
  return function (text: string, render: any): string {
    text = render(text);
    return text.substring(text.lastIndexOf('.') + 1);
  }
}

const middleSegments = function () {
  return function (text: string, render: any): string {
    return render(text).split('.').slice(1, -1).join('.');
  }
}

const normalizeToPath = function () {
  return function (text: string, render: any): string {
    return render(text).replaceAll(".", "/");
  }
}
