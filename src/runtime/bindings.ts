import { Interpreter } from "../interpreter/interpreter";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import type { ASValue, NativeFunctionValue, NativeObjectValue } from "../interpreter/values.ts";
import {
    INT, FLOAT, BOOL, STRING, NULL_VAL, VOID_VAL, HANDLE,
    stringify, asNumber, isTruthy,
} from "../interpreter/values";

export type { ASValue };
export { INT, FLOAT, BOOL, STRING, NULL_VAL, VOID_VAL, HANDLE, stringify, asNumber, isTruthy };

export class ScriptEngine {
    public interp: Interpreter;

    constructor() {
        this.interp = new Interpreter();
        this.registerBuiltins();
    }

    registerFunction(name: string, fn: (...args: ASValue[]) => ASValue): void {
        const native: NativeFunctionValue = { kind: "native_function", name, fn };
        this.interp.globals.define(name, native);
    }

    registerGlobal(name: string, value: ASValue): void {
        this.interp.globals.define(name, value);
    }

    registerInt(name: string, value: number): void {
        this.interp.globals.define(name, INT(value));
    }

    registerObject(name: string, obj: object, typeName?: string): void {
        const native: NativeObjectValue = {
            kind: "native",
            typeName: typeName ?? obj.constructor?.name ?? name,
            native: obj,
        };
        this.interp.globals.define(name, native);
    }

    registerClass(name: string, factory: (...args: unknown[]) => object): void {
        this.interp.globals.define(name, {
            kind: "native_function",
            name,
            fn: (...args: ASValue[]) => {
                const obj = factory(...args.map(a => this.interp.unwrap(a)));
                return this.interp.wrapNative(obj);
            },
        });
    }

    load(source: string): void {
        const lexer = new Lexer(source);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const program = parser.parse();
        this.interp.execute(program);
    }

    call(name: string, args: ASValue[] = []): ASValue {
        return this.interp.callFunction(name, args);
    }

    getGlobal(name: string): ASValue {
        return this.interp.globals.get(name);
    }

    setGlobal(name: string, value: ASValue): void {
        this.interp.globals.set(name, value);
    }

    private registerBuiltins(): void {
        this.registerFunction("rand", () => INT(Math.floor(Math.random() * 2147483647)));
        this.registerFunction("random", () => FLOAT(Math.random()));
        this.registerFunction("abs", (x) => x.kind === "float" ? FLOAT(Math.abs(asNumber(x))) : INT(Math.abs(asNumber(x))));
        this.registerFunction("floor", (x) => INT(Math.floor(asNumber(x))));
        this.registerFunction("ceil", (x) => INT(Math.ceil(asNumber(x))));
        this.registerFunction("sqrt", (x) => FLOAT(Math.sqrt(asNumber(x))));
        this.registerFunction("pow", (x, y) => FLOAT(Math.pow(asNumber(x), asNumber(y))));
        this.registerFunction("min", (x, y) => {
            const a = asNumber(x), b = asNumber(y);
            return x.kind === "float" || y.kind === "float" ? FLOAT(Math.min(a, b)) : INT(Math.min(a, b));
        });
        this.registerFunction("max", (x, y) => {
            const a = asNumber(x), b = asNumber(y);
            return x.kind === "float" || y.kind === "float" ? FLOAT(Math.max(a, b)) : INT(Math.max(a, b));
        });

        this.registerFunction("String", (val) => STRING(stringify(val)));
        this.registerClass("String", (val: unknown) => ({ toString: () => String(val) }));

        this.registerFunction("HEALTH_TO_INT", (x) => INT(Math.floor(asNumber(x))));
        this.registerFunction("ARMOR_TO_INT", (x) => INT(Math.floor(asNumber(x))));

        this.registerFunction("print", (...args) => {
            console.log(...args.map(a => stringify(a)));
            return VOID_VAL;
        });
    }
}