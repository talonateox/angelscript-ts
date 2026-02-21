export type ASValue =
    | IntValue
    | FloatValue
    | BoolValue
    | StringValue
    | NullValue
    | ObjectValue
    | NativeObjectValue
    | HandleValue
    | VoidValue
    | ArrayValue
    | NativeFunctionValue
    | FunctionValue;

export interface IntValue { kind: "int"; value: number; }
export interface FloatValue { kind: "float"; value: number; }
export interface BoolValue { kind: "bool"; value: boolean; }
export interface StringValue { kind: "string"; value: string; }
export interface NullValue { kind: "null"; }
export interface VoidValue { kind: "void"; }

export interface ObjectValue {
    kind: "object";
    typeName: string;
    fields: Map<string, ASValue>;
    refCount: number;
}

export interface NativeObjectValue {
    kind: "native";
    typeName: string;
    native: any;
}

export interface HandleValue {
    kind: "handle";
    ref: ObjectValue | NativeObjectValue | null;
}

export interface ArrayValue {
    kind: "array";
    elements: ASValue[];
}

export interface FunctionValue {
    kind: "function";
    name: string;
    decl: any;
    thisVal?: ObjectValue | NativeObjectValue;
}

export interface NativeFunctionValue {
    kind: "native_function";
    name: string;
    fn: (...args: ASValue[]) => ASValue;
}

export const INT = (value: number): IntValue => ({ kind: "int", value: value | 0 });
export const FLOAT = (value: number): FloatValue => ({ kind: "float", value });
export const BOOL = (value: boolean): BoolValue => ({ kind: "bool", value });
export const STRING = (value: string): StringValue => ({ kind: "string", value });
export const NULL_VAL: NullValue = { kind: "null" };
export const VOID_VAL: VoidValue = { kind: "void" };
export const HANDLE = (ref: ObjectValue | NativeObjectValue | null): HandleValue => ({ kind: "handle", ref });
export const ARRAY = (elements: ASValue[] = []): ArrayValue => ({ kind: "array", elements });

export function newObject(typeName: string): ObjectValue {
    return { kind: "object", typeName, fields: new Map(), refCount: 1 };
}

export function isTruthy(val: ASValue): boolean {
    switch (val.kind) {
        case "bool": return val.value;
        case "int": return val.value !== 0;
        case "float": return val.value !== 0;
        case "string": return val.value.length > 0;
        case "null": return false;
        case "handle": return val.ref !== null;
        case "void": return false;
        case "array": return true;
        default: return true;
    }
}

export function asNumber(val: ASValue): number {
    if (val.kind === "int") return val.value;
    if (val.kind === "float") return val.value;
    if (val.kind === "bool") return val.value ? 1 : 0;
    throw new Error(`Cannot convert ${val.kind} to number`);
}

export function isEqual(a: ASValue, b: ASValue): boolean {
    if (a.kind === "null" && b.kind === "null") return true;
    if (a.kind === "null" || b.kind === "null") return false;
    if (a.kind === "handle" && b.kind === "handle") return a.ref === b.ref;
    if ((a.kind === "int" || a.kind === "float") && (b.kind === "int" || b.kind === "float")) {
        return asNumber(a) === asNumber(b);
    }
    if (a.kind === "string" && b.kind === "string") return a.value === b.value;
    if (a.kind === "bool" && b.kind === "bool") return a.value === b.value;
    if (a.kind === "object" && b.kind === "object") return a === b;
    return false;
}

export function stringify(val: ASValue): string {
    switch (val.kind) {
        case "int": return val.value.toString();
        case "float": return val.value.toString();
        case "bool": return val.value ? "true" : "false";
        case "string": return val.value;
        case "null": return "null";
        case "void": return "";
        case "handle": return val.ref ? `[${val.ref.typeName} handle]` : "null";
        case "object": return `[${val.typeName}]`;
        case "native": return `[${val.typeName}]`;
        case "array": return `[${val.elements.map((val) => stringify(val))}]`;
        case "function": return `[function ${val.name}]`;
        case "native_function": return `[native ${val.name}]`;
    }
}