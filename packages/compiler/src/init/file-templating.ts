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

    /**
     * (TO BE DELTETED)
     * 
     * These new functions are used like this, in a tspconfig.yaml file:
     * 
     *  package-dir: "az{{#lastSegment}}{{#toLowerCase}}{{parameters.ServiceNamespace}}{{/toLowerCase}}{{/lastSegment}}"
    service-dir: "sdk/{{#normalizeToPath}}{{#middleSegments}}{{#toLowerCase}}{{parameters.ServiceNamespace}}{{/toLowerCase}}{{/middleSegments}}{{/normalizeToPath}}"
     * 
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
