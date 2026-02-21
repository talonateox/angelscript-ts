import type { ASValue } from "./values";
import { VOID_VAL } from "./values";

export class Environment {
    private vars = new Map<string, ASValue>();

    constructor(public parent?: Environment) { }

    get(name: string): ASValue {
        if (this.vars.has(name)) return this.vars.get(name)!;
        if (this.parent) return this.parent.get(name);
        throw new RuntimeError(`Undefined variable '${name}'`);
    }

    set(name: string, value: ASValue): void {
        if (this.vars.has(name)) {
            this.vars.set(name, value);
            return;
        }
        if (this.parent && this.parent.has(name)) {
            this.parent.set(name, value);
            return;
        }
        this.vars.set(name, value);
    }

    define(name: string, value: ASValue): void {
        this.vars.set(name, value);
    }

    has(name: string): boolean {
        if (this.vars.has(name)) return true;
        if (this.parent) return this.parent.has(name);
        return false;
    }

    child(): Environment {
        return new Environment(this);
    }
}

export class ReturnSignal {
    constructor(public value: ASValue = VOID_VAL) { }
}

export class BreakSignal { }
export class ContinueSignal { }

export class RuntimeError extends Error {
    constructor(message: string, public line?: number) {
        super(line ? `[Runtime] ${message} at line ${line}` : `[Runtime] ${message}`);
    }
}