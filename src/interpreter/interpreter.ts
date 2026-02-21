import * as AST from "../parser/ast";
import type {
    ASValue, ObjectValue, NativeObjectValue, FunctionValue, NativeFunctionValue, HandleValue,
} from "./values.ts";
import {
    INT, FLOAT, BOOL, STRING, NULL_VAL, VOID_VAL, HANDLE,
    newObject, isTruthy, asNumber, isEqual, stringify,
} from "./values";
import { Environment, ReturnSignal, BreakSignal, ContinueSignal, RuntimeError } from "./environment";

export class Interpreter {
    public globals: Environment = new Environment();

    private classDefs = new Map<string, AST.ClassDecl>();

    execute(program: AST.Program): void {
        for (const decl of program.body) {
            if (decl.kind === "ClassDecl") {
                this.classDefs.set(decl.name, decl);
                this.globals.define(decl.name, {
                    kind: "native_function",
                    name: decl.name,
                    fn: (...args: ASValue[]) => this.instantiateClass(decl.name, args),
                });
            } else if (decl.kind === "FuncDecl") {
                const fn: FunctionValue = { kind: "function", name: decl.name, decl };
                this.globals.define(decl.name, fn);
            }
        }

        for (const decl of program.body) {
            if (decl.kind === "VarDecl") {
                let value: ASValue;
                if (decl.initializer) {
                    value = this.evalExpr(decl.initializer, this.globals);
                } else if (this.classDefs.has(decl.typeRef.name)) {
                    value = this.instantiateClass(decl.typeRef.name, []);
                } else {
                    value = this.defaultValue(decl.typeRef);
                }
                this.globals.define(decl.name, value);
            }
        }
    }

    callFunction(name: string, args: ASValue[] = []): ASValue {
        const fn = this.globals.get(name);
        return this.callValue(fn, args, undefined);
    }

    private execStmt(stmt: AST.Stmt, env: Environment): void {
        switch (stmt.kind) {
            case "Block":
                this.execBlock(stmt, env.child());
                break;
            case "VarDecl":
                this.execVarDecl(stmt, env);
                break;
            case "ExprStmt":
                this.evalExpr(stmt.expr, env);
                break;
            case "IfStmt":
                this.execIf(stmt, env);
                break;
            case "ForStmt":
                this.execFor(stmt, env);
                break;
            case "WhileStmt":
                this.execWhile(stmt, env);
                break;
            case "DoWhileStmt":
                this.execDoWhile(stmt, env);
                break;
            case "ReturnStmt":
                throw new ReturnSignal(stmt.value ? this.evalExpr(stmt.value, env) : VOID_VAL);
            case "BreakStmt":
                throw new BreakSignal();
            case "ContinueStmt":
                throw new ContinueSignal();
            case "SwitchStmt":
                this.execSwitch(stmt, env);
                break;
            default:
                throw new RuntimeError(`Unknown statement kind: ${(stmt as any).kind}`);
        }
    }

    private execBlock(block: AST.Block, env: Environment): void {
        for (const stmt of block.body) {
            this.execStmt(stmt, env);
        }
    }

    private execVarDecl(decl: AST.VarDecl, env: Environment): void {
        const value = decl.initializer
            ? this.evalExpr(decl.initializer, env)
            : this.defaultValue(decl.typeRef);
        env.define(decl.name, value);
    }

    private execIf(stmt: AST.IfStmt, env: Environment): void {
        if (isTruthy(this.evalExpr(stmt.condition, env))) {
            this.execStmt(stmt.then, env);
        } else if (stmt.else) {
            this.execStmt(stmt.else, env);
        }
    }

    private execFor(stmt: AST.ForStmt, env: Environment): void {
        const loopEnv = env.child();

        if (stmt.init) {
            if (stmt.init.kind === "VarDecl") this.execVarDecl(stmt.init, loopEnv);
            else this.evalExpr(stmt.init.expr, loopEnv);
        }

        while (true) {
            if (stmt.condition && !isTruthy(this.evalExpr(stmt.condition, loopEnv))) break;

            try {
                this.execStmt(stmt.body, loopEnv);
            } catch (e) {
                if (e instanceof BreakSignal) break;
                if (e instanceof ContinueSignal) { /* fall through to update */ }
                else throw e;
            }

            if (stmt.update) this.evalExpr(stmt.update, loopEnv);
        }
    }

    private execWhile(stmt: AST.WhileStmt, env: Environment): void {
        while (isTruthy(this.evalExpr(stmt.condition, env))) {
            try {
                this.execStmt(stmt.body, env);
            } catch (e) {
                if (e instanceof BreakSignal) break;
                if (e instanceof ContinueSignal) continue;
                throw e;
            }
        }
    }

    private execDoWhile(stmt: AST.DoWhileStmt, env: Environment): void {
        do {
            try {
                this.execStmt(stmt.body, env);
            } catch (e) {
                if (e instanceof BreakSignal) break;
                if (e instanceof ContinueSignal) continue;
                throw e;
            }
        } while (isTruthy(this.evalExpr(stmt.condition, env)));
    }

    private execSwitch(stmt: AST.SwitchStmt, env: Environment): void {
        const val = this.evalExpr(stmt.expr, env);
        let matched = false;

        for (const c of stmt.cases) {
            if (!matched) {
                if (c.value === undefined) { matched = true; }
                else if (isEqual(val, this.evalExpr(c.value, env))) { matched = true; }
            }
            if (matched) {
                try {
                    for (const s of c.body) this.execStmt(s, env);
                } catch (e) {
                    if (e instanceof BreakSignal) return;
                    throw e;
                }
            }
        }
    }

    evalExpr(expr: AST.Expr, env: Environment): ASValue {
        switch (expr.kind) {
            case "IntLiteral": return INT(expr.value);
            case "FloatLiteral": return FLOAT(expr.value);
            case "StringLiteral": return STRING(expr.value);
            case "BoolLiteral": return BOOL(expr.value);
            case "NullLiteral": return NULL_VAL;

            case "Identifier": return env.get(expr.name);

            case "AssignExpr": return this.evalAssign(expr, env);
            case "HandleAssignExpr": return this.evalHandleAssign(expr, env);
            case "BinaryExpr": return this.evalBinary(expr, env);
            case "UnaryExpr": return this.evalUnary(expr, env);
            case "CallExpr": return this.evalCall(expr, env);
            case "MemberExpr": return this.evalMember(expr, env);
            case "IndexExpr": return this.evalIndex(expr, env);
            case "NewExpr": return this.evalNew(expr, env);
            case "TernaryExpr":
                return isTruthy(this.evalExpr(expr.condition, env))
                    ? this.evalExpr(expr.then, env)
                    : this.evalExpr(expr.else, env);
            case "CastExpr":
                return this.evalCast(expr, env);

            default:
                throw new RuntimeError(`Unknown expression kind: ${(expr as any).kind}`);
        }
    }

    private evalAssign(expr: AST.AssignExpr, env: Environment): ASValue {
        const value = this.evalExpr(expr.value, env);

        const computeValue = (current: ASValue): ASValue => {
            if (expr.op === "=") return value;
            const l = asNumber(current);
            const r = asNumber(value);
            switch (expr.op) {
                case "+=": return this.makeNumeric(current, l + r);
                case "-=": return this.makeNumeric(current, l - r);
                case "*=": return this.makeNumeric(current, l * r);
                case "/=": return this.makeNumeric(current, r !== 0 ? l / r : 0);
                case "%=": return this.makeNumeric(current, l % r);
                case "&=": return INT((l | 0) & (r | 0));
                case "|=": return INT((l | 0) | (r | 0));
                case "^=": return INT((l | 0) ^ (r | 0));
                default: throw new RuntimeError(`Unknown op ${expr.op}`);
            }
        };

        this.assignTo(expr.target, env, computeValue);
        return value;
    }

    private evalHandleAssign(expr: AST.HandleAssignExpr, env: Environment): ASValue {
        const rhs = this.evalExpr(expr.value, env);
        const handle: HandleValue = rhs.kind === "handle" ? rhs
            : rhs.kind === "null" ? HANDLE(null)
                : rhs.kind === "object" || rhs.kind === "native" ? HANDLE(rhs)
                    : HANDLE(null);

        this.assignTo(expr.target, env, () => handle);
        return handle;
    }

    private assignTo(target: AST.Expr, env: Environment, getValue: (current: ASValue) => ASValue): void {
        if (target.kind === "Identifier") {
            const current = env.has(target.name) ? env.get(target.name) : INT(0);
            env.set(target.name, getValue(current));
        } else if (target.kind === "MemberExpr") {
            const obj = this.evalExpr(target.object, env);
            const fields = this.getFields(obj, target.line);
            const current = fields.get(target.member) ?? INT(0);
            fields.set(target.member, getValue(current));
        } else if (target.kind === "IndexExpr") {
            const obj = this.evalExpr(target.object, env);
            const idx = this.evalExpr(target.index, env);
            if (obj.kind === "native") {
                const arr = obj.native;
                const i = asNumber(idx);
                const current = this.wrapNative(arr[i]);
                arr[i] = this.unwrap(getValue(current));
            } else {
                throw new RuntimeError(`Index assignment on non-array`);
            }
        } else {
            throw new RuntimeError(`Invalid assignment target`);
        }
    }

    private evalBinary(expr: AST.BinaryExpr, env: Environment): ASValue {
        if (expr.op === "&&") {
            const l = this.evalExpr(expr.left, env);
            return isTruthy(l) ? this.evalExpr(expr.right, env) : BOOL(false);
        }
        if (expr.op === "||") {
            const l = this.evalExpr(expr.left, env);
            return isTruthy(l) ? BOOL(true) : this.evalExpr(expr.right, env);
        }

        const left = this.evalExpr(expr.left, env);
        const right = this.evalExpr(expr.right, env);

        if (expr.op === "+" && (left.kind === "string" || right.kind === "string")) {
            return STRING(stringify(left) + stringify(right));
        }

        switch (expr.op) {
            case "+": return this.makeNumeric(left, asNumber(left) + asNumber(right));
            case "-": return this.makeNumeric(left, asNumber(left) - asNumber(right));
            case "*": return this.makeNumeric(left, asNumber(left) * asNumber(right));
            case "/": {
                const r = asNumber(right);
                return this.makeNumeric(left, r !== 0 ? asNumber(left) / r : 0);
            }
            case "%": return this.makeNumeric(left, asNumber(left) % asNumber(right));
            case "&": return INT((asNumber(left) | 0) & (asNumber(right) | 0));
            case "|": return INT((asNumber(left) | 0) | (asNumber(right) | 0));
            case "^": return INT((asNumber(left) | 0) ^ (asNumber(right) | 0));
            case "<<": return INT((asNumber(left) | 0) << (asNumber(right) | 0));
            case ">>": return INT((asNumber(left) | 0) >> (asNumber(right) | 0));
            case "==": return BOOL(isEqual(left, right));
            case "!=": return BOOL(!isEqual(left, right));
            case "<": return BOOL(asNumber(left) < asNumber(right));
            case ">": return BOOL(asNumber(left) > asNumber(right));
            case "<=": return BOOL(asNumber(left) <= asNumber(right));
            case ">=": return BOOL(asNumber(left) >= asNumber(right));
            default:
                throw new RuntimeError(`Unknown binary op: ${expr.op}`);
        }
    }

    private evalUnary(expr: AST.UnaryExpr, env: Environment): ASValue {
        if (expr.op === "++" || expr.op === "--") {
            const delta = expr.op === "++" ? 1 : -1;
            const current = this.evalExpr(expr.operand, env);
            const newVal = this.makeNumeric(current, asNumber(current) + delta);
            this.assignTo(expr.operand, env, () => newVal);
            return expr.prefix ? newVal : current;
        }

        const val = this.evalExpr(expr.operand, env);

        switch (expr.op) {
            case "-": return this.makeNumeric(val, -asNumber(val));
            case "!": return BOOL(!isTruthy(val));
            case "~": return INT(~(asNumber(val) | 0));
            case "@":
                return val.kind === "handle" ? val
                    : val.kind === "object" || val.kind === "native" ? HANDLE(val)
                        : HANDLE(null);
            default:
                throw new RuntimeError(`Unknown unary op: ${expr.op}`);
        }
    }

    private evalCall(expr: AST.CallExpr, env: Environment): ASValue {
        const args = expr.args.map(a => this.evalExpr(a, env));

        if (expr.callee.kind === "MemberExpr") {
            const obj = this.evalExpr(expr.callee.object, env);
            const methodName = expr.callee.member;
            return this.callMethod(obj, methodName, args, expr.callee.line);
        }

        const callee = this.evalExpr(expr.callee, env);
        return this.callValue(callee, args, undefined);
    }

    private evalMember(expr: AST.MemberExpr, env: Environment): ASValue {
        const obj = this.evalExpr(expr.object, env);
        return this.getMember(obj, expr.member, expr.line);
    }

    private evalIndex(expr: AST.IndexExpr, env: Environment): ASValue {
        const obj = this.evalExpr(expr.object, env);
        const idx = this.evalExpr(expr.index, env);

        if (obj.kind === "native") {
            const arr = obj.native;
            const i = asNumber(idx);
            return this.wrapNative(arr[i]);
        }
        throw new RuntimeError(`Index on non-indexable value`, expr.line);
    }

    private evalNew(expr: AST.NewExpr, env: Environment): ASValue {
        const args = expr.args.map(a => this.evalExpr(a, env));
        return this.instantiateClass(expr.typeName, args);
    }

    private evalCast(expr: AST.CastExpr, env: Environment): ASValue {
        const val = this.evalExpr(expr.expr, env);
        switch (expr.targetType.name) {
            case "int": case "uint": case "int8": case "int16": case "int64":
            case "uint8": case "uint16": case "uint64":
                return INT(asNumber(val));
            case "float": case "double":
                return FLOAT(asNumber(val));
            case "bool": return BOOL(isTruthy(val));
            case "string": return STRING(stringify(val));
            default: return val;
        }
    }

    private getMember(obj: ASValue, name: string, line?: number): ASValue {
        if (obj.kind === "handle") {
            if (obj.ref === null) throw new RuntimeError(`Null handle dereference`, line);
            return this.getMember(obj.ref, name, line);
        }

        if (obj.kind === "object") {
            if (obj.fields.has(name)) return obj.fields.get(name)!;

            const classDef = this.classDefs.get(obj.typeName);
            if (classDef) {
                const method = classDef.members.find(m => m.kind === "FuncDecl" && m.name === name);
                if (method && method.kind === "FuncDecl") {
                    return { kind: "function", name, decl: method, thisVal: obj };
                }
            }
            throw new RuntimeError(`No member '${name}' on ${obj.typeName}`, line);
        }

        if (obj.kind === "native") {
            const val = obj.native[name];
            if (typeof val === "function") {
                return {
                    kind: "native_function",
                    name,
                    fn: (...args: ASValue[]) => this.wrapNative(val.apply(obj.native, args.map(a => this.unwrap(a)))),
                };
            }
            return this.wrapNative(val);
        }

        if (obj.kind === "string") {
            return this.stringMethod(obj.value, name, line);
        }

        throw new RuntimeError(`Cannot access member '${name}' on ${obj.kind}`, line);
    }

    private callMethod(obj: ASValue, name: string, args: ASValue[], line?: number): ASValue {
        if (obj.kind === "handle") {
            if (obj.ref === null) throw new RuntimeError(`Null handle method call '${name}'`, line);
            return this.callMethod(obj.ref, name, args, line);
        }

        const member = this.getMember(obj, name, line);
        if (obj.kind === "object") {
            return this.callValue(member, args, obj);
        }
        return this.callValue(member, args, undefined);
    }

    callValue(val: ASValue, args: ASValue[], thisVal: ObjectValue | NativeObjectValue | undefined): ASValue {
        if (val.kind === "native_function") {
            return val.fn(...args);
        }

        if (val.kind === "function") {
            const decl: AST.FuncDecl = val.decl;
            const fnEnv = this.globals.child();

            const self = thisVal ?? val.thisVal;
            if (self) {
                if (self.kind === "object") {
                    fnEnv.define("this", self);
                    for (const [k, v] of self.fields) fnEnv.define(k, v);
                } else {
                    fnEnv.define("this", self);
                }
            }

            for (let i = 0; i < decl.params.length; i++) {
                const param = decl.params[i];
                fnEnv.define(param.name, args[i] ?? this.defaultValue(param.typeRef));
            }

            try {
                this.execBlock(decl.body, fnEnv);
                if (self && self.kind === "object") this.syncFields(self, fnEnv, decl);
                return VOID_VAL;
            } catch (e) {
                if (e instanceof ReturnSignal) {
                    if (self && self.kind === "object") this.syncFields(self, fnEnv, decl);
                    return e.value;
                }
                throw e;
            }
        }

        throw new RuntimeError(`Cannot call value of kind '${val.kind}'`);
    }

    private syncFields(obj: ObjectValue, env: Environment, decl: AST.FuncDecl): void {
        const classDef = this.classDefs.get(obj.typeName);
        if (!classDef) return;
        for (const member of classDef.members) {
            if (member.kind === "VarDecl" && env.has(member.name)) {
                obj.fields.set(member.name, env.get(member.name));
            }
        }
    }

    instantiateClass(name: string, args: ASValue[]): ObjectValue {
        const classDef = this.classDefs.get(name);
        if (!classDef) throw new RuntimeError(`Unknown class '${name}'`);

        const obj = newObject(name);

        for (const member of classDef.members) {
            if (member.kind === "VarDecl") {
                const val = member.initializer
                    ? this.evalExpr(member.initializer, this.globals)
                    : this.defaultValue(member.typeRef);
                obj.fields.set(member.name, val);
            }
        }

        const ctor = classDef.members.find(m => m.kind === "FuncDecl" && m.name === name);
        if (ctor && ctor.kind === "FuncDecl") {
            this.callValue({ kind: "function", name, decl: ctor, thisVal: obj }, args, obj);
        }

        return obj;
    }

    private stringMethod(s: string, name: string, line?: number): ASValue {
        const methods: Record<string, NativeFunctionValue> = {
            len: { kind: "native_function", name: "len", fn: () => INT(s.length) },
            length: { kind: "native_function", name: "length", fn: () => INT(s.length) },
            empty: { kind: "native_function", name: "empty", fn: () => BOOL(s.length === 0) },
            toInt: { kind: "native_function", name: "toInt", fn: () => INT(parseInt(s) || 0) },
            toFloat: { kind: "native_function", name: "toFloat", fn: () => FLOAT(parseFloat(s) || 0) },
            toUpper: { kind: "native_function", name: "toUpper", fn: () => STRING(s.toUpperCase()) },
            toLower: { kind: "native_function", name: "toLower", fn: () => STRING(s.toLowerCase()) },
            getToken: {
                kind: "native_function", name: "getToken",
                fn: (idx: ASValue) => {
                    const tokens = s.trim().split(/\s+/);
                    const i = asNumber(idx);
                    return STRING(tokens[i] ?? "");
                },
            },
            substr: {
                kind: "native_function", name: "substr",
                fn: (start: ASValue, len?: ASValue) => {
                    const s2 = len ? s.substr(asNumber(start), asNumber(len)) : s.substr(asNumber(start));
                    return STRING(s2);
                },
            },
            findFirst: {
                kind: "native_function", name: "findFirst",
                fn: (sub: ASValue) => INT(s.indexOf(stringify(sub))),
            },
        };

        if (name in methods) return methods[name];
        throw new RuntimeError(`No string method '${name}'`, line);
    }

    private makeNumeric(ref: ASValue, value: number): ASValue {
        if (ref.kind === "float") return FLOAT(value);
        return INT(value);
    }

    private defaultValue(typeRef: AST.TypeRef): ASValue {
        if (typeRef.isHandle) return HANDLE(null);
        switch (typeRef.name) {
            case "int": case "uint": case "int8": case "int16": case "int64":
            case "uint8": case "uint16": case "uint64": return INT(0);
            case "float": case "double": return FLOAT(0);
            case "bool": return BOOL(false);
            case "string": return STRING("");
            case "void": return VOID_VAL;
            default:
                return HANDLE(null);
        }
    }

    wrapNative(val: unknown): ASValue {
        if (val === null || val === undefined) return NULL_VAL;
        if (typeof val === "number") return Number.isInteger(val) ? INT(val) : FLOAT(val);
        if (typeof val === "boolean") return BOOL(val);
        if (typeof val === "string") return STRING(val);
        if (typeof val === "function") return { kind: "native_function", name: val.name, fn: (...args: ASValue[]) => this.wrapNative(val(...args.map(a => this.unwrap(a)))) };
        if (Array.isArray(val)) return { kind: "native", typeName: "array", native: val };
        if (typeof val === "object") return { kind: "native", typeName: (val as any).constructor?.name ?? "object", native: val };
        return NULL_VAL;
    }

    unwrap(val: ASValue): unknown {
        switch (val.kind) {
            case "int": return val.value;
            case "float": return val.value;
            case "bool": return val.value;
            case "string": return val.value;
            case "null": return null;
            case "void": return undefined;
            case "handle": return val.ref ? (val.ref.kind === "native" ? val.ref.native : val.ref) : null;
            case "object": return val;
            case "native": return val.native;
            default: return null;
        }
    }

    private getFields(obj: ASValue, line?: number): Map<string, ASValue> {
        if (obj.kind === "object") return obj.fields;
        if (obj.kind === "handle") {
            if (obj.ref === null) throw new RuntimeError(`Null handle field access`, line);
            if (obj.ref.kind === "object") return obj.ref.fields;
        }
        throw new RuntimeError(`Cannot get fields of ${obj.kind}`, line);
    }
}