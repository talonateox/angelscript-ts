import { Token, TokenType } from "../lexer/token";
import * as AST from "./ast";

export class ParseError extends Error {
    constructor(message: string, public line: number, public col: number) {
        super(`[Parser] ${message} at ${line}:${col}`);
    }
}

const TYPE_TOKENS = new Set([
    TokenType.INT, TokenType.UINT, TokenType.INT8, TokenType.INT16, TokenType.INT64,
    TokenType.UINT8, TokenType.UINT16, TokenType.UINT64,
    TokenType.FLOAT, TokenType.DOUBLE, TokenType.BOOL, TokenType.STRING,
    TokenType.VOID,
]);

const ASSIGN_OPS = new Set([
    TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN,
    TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN, TokenType.PERCENT_ASSIGN,
    TokenType.AMP_ASSIGN, TokenType.PIPE_ASSIGN, TokenType.CARET_ASSIGN,
]);

export class Parser {
    private pos = 0;

    constructor(private tokens: Token[]) { }

    parse(): AST.Program {
        const body: AST.TopLevelDecl[] = [];
        while (!this.isAtEnd()) {
            body.push(this.parseTopLevel());
        }
        return { kind: "Program", body };
    }

    private parseTopLevel(): AST.TopLevelDecl {
        if (this.check(TokenType.CLASS)) return this.parseClass();
        if (this.checkIdent("enum")) return this.parseEnum();
        return this.parseVarOrFunc();
    }

    private parseVarOrFunc(): AST.VarDecl | AST.FuncDecl {
        const line = this.peek().line;
        const isConst = this.matchTok(TokenType.CONST);
        const typeRef = this.parseTypeRef();
        const name = this.expect(TokenType.IDENTIFIER).value;

        if (typeRef.name === "array" && this.check(TokenType.LPAREN)) {
            this.advance();
            const arraySizeInit = this.parseExpr();
            this.expect(TokenType.RPAREN);
            this.expect(TokenType.SEMICOLON);
            return { kind: "VarDecl", typeRef, name, arraySizeInit, isConst, line };
        }

        if (this.check(TokenType.LPAREN)) {
            if (isConst) this.error("Functions cannot be const");
            return this.parseFuncRest(typeRef, name);
        }

        let initializer: AST.Expr | undefined;
        if (this.matchTok(TokenType.ASSIGN)) initializer = this.parseExpr();
        this.expect(TokenType.SEMICOLON);
        return { kind: "VarDecl", typeRef, name, initializer, isConst, line };
    }

    private parseFuncRest(returnType: AST.TypeRef, name: string): AST.FuncDecl {
        const line = this.peek().line;
        this.expect(TokenType.LPAREN);
        const params = this.parseParams();
        this.expect(TokenType.RPAREN);
        const body = this.parseBlock();
        return { kind: "FuncDecl", returnType, name, params, body, line };
    }

    private parseParams(): AST.Param[] {
        const params: AST.Param[] = [];
        if (this.check(TokenType.RPAREN)) return params;
        do {
            let qualifier: AST.Param["qualifier"];
            if (this.checkIdent("in")) { this.advance(); qualifier = "in"; }
            else if (this.checkIdent("out")) { this.advance(); qualifier = "out"; }
            else if (this.checkIdent("inout")) { this.advance(); qualifier = "inout"; }

            const typeRef = this.parseTypeRef();
            let name = "";
            if (this.check(TokenType.IDENTIFIER)) name = this.advance().value;
            params.push({ typeRef, name, qualifier });
        } while (this.matchTok(TokenType.COMMA));
        return params;
    }

    private parseClass(): AST.ClassDecl {
        const line = this.peek().line;
        this.expect(TokenType.CLASS);
        const name = this.expect(TokenType.IDENTIFIER).value;
        this.expect(TokenType.LBRACE);
        const members: AST.ClassMember[] = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            members.push(this.parseClassMember(name));
        }
        this.expect(TokenType.RBRACE);
        return { kind: "ClassDecl", name, members, line };
    }

    private parseClassMember(className: string): AST.ClassMember {
        const line = this.peek().line;
        const isConst = this.matchTok(TokenType.CONST);

        if (this.check(TokenType.TILDE)) {
            this.advance();
            const dname = "~" + this.expect(TokenType.IDENTIFIER).value;
            const returnType: AST.TypeRef = { name: "void", isHandle: false, isConst: false };
            return this.parseFuncRest(returnType, dname);
        }

        if (this.check(TokenType.IDENTIFIER) && this.tokens[this.pos + 1]?.type === TokenType.LPAREN) {
            const cname = this.peek().value;
            if (cname === className) {
                this.advance();
                const returnType: AST.TypeRef = { name: "void", isHandle: false, isConst: false };
                return this.parseFuncRest(returnType, cname);
            }
        }

        const typeRef = this.parseTypeRef();
        const name = this.expect(TokenType.IDENTIFIER).value;

        if (this.check(TokenType.LPAREN)) {
            return this.parseFuncRest(typeRef, name);
        }

        let initializer: AST.Expr | undefined;
        if (this.matchTok(TokenType.ASSIGN)) initializer = this.parseExpr();
        this.expect(TokenType.SEMICOLON);
        return { kind: "VarDecl", typeRef, name, initializer, isConst, line };
    }

    private parseEnum(): AST.EnumDecl {
        const line = this.peek().line;
        this.advance();
        const name = this.expect(TokenType.IDENTIFIER).value;
        this.expect(TokenType.LBRACE);
        const values: { name: string; value?: AST.Expr }[] = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            const eName = this.expect(TokenType.IDENTIFIER).value;
            let value: AST.Expr | undefined;
            if (this.matchTok(TokenType.ASSIGN)) value = this.parseExpr();
            values.push({ name: eName, value });
            if (!this.matchTok(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RBRACE);
        return { kind: "EnumDecl", name, values, line };
    }

    private parseTypeRef(): AST.TypeRef {
        const isConst = this.matchTok(TokenType.CONST);
        let name: string;

        if (TYPE_TOKENS.has(this.peek().type)) {
            name = this.advance().value;
        } else if (this.check(TokenType.IDENTIFIER)) {
            name = this.advance().value;
            if (this.check(TokenType.NAMESPACE)) {
                this.advance();
                name += "::" + this.expect(TokenType.IDENTIFIER).value;
            }
        } else {
            this.error(`Expected type name, got '${this.peek().value}'`);
        }

        let templateArg: AST.TypeRef | undefined;
        if (this.check(TokenType.LT)) {
            this.advance();
            templateArg = this.parseTypeRef();
            this.expect(TokenType.GT);
        }

        if (this.check(TokenType.LBRACKET) && this.tokens[this.pos + 1]?.type === TokenType.RBRACKET) {
            this.advance(); this.advance();
            const elementType: AST.TypeRef = { name, isHandle: false, isConst };
            const isHandle = this.matchTok(TokenType.AT);
            return { name: "array", isHandle, isConst: false, templateArg: elementType };
        }

        const isHandle = this.matchTok(TokenType.AT);
        return { name, isHandle, isConst, templateArg };
    }

    private parseBlock(): AST.Block {
        const line = this.peek().line;
        this.expect(TokenType.LBRACE);
        const body: AST.Stmt[] = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            body.push(this.parseStmt());
        }
        this.expect(TokenType.RBRACE);
        return { kind: "Block", body, line };
    }

    private parseStmt(): AST.Stmt {
        if (this.check(TokenType.LBRACE)) return this.parseBlock();
        if (this.check(TokenType.IF)) return this.parseIf();
        if (this.check(TokenType.FOR)) return this.parseFor();
        if (this.check(TokenType.WHILE)) return this.parseWhile();
        if (this.check(TokenType.DO)) return this.parseDoWhile();
        if (this.check(TokenType.RETURN)) return this.parseReturn();
        if (this.check(TokenType.SWITCH)) return this.parseSwitch();
        if (this.check(TokenType.BREAK)) {
            const line = this.advance().line;
            this.expect(TokenType.SEMICOLON);
            return { kind: "BreakStmt", line };
        }
        if (this.check(TokenType.CONTINUE)) {
            const line = this.advance().line;
            this.expect(TokenType.SEMICOLON);
            return { kind: "ContinueStmt", line };
        }

        if (this.check(TokenType.CONST) || this.isTypeStart()) {
            const saved = this.pos;
            try {
                return this.parseLocalVarDecl();
            } catch {
                this.pos = saved;
            }
        }

        return this.parseExprStmt();
    }

    private parseLocalVarDecl(): AST.VarDecl {
        const line = this.peek().line;
        const isConst = this.matchTok(TokenType.CONST);
        const typeRef = this.parseTypeRef();
        const name = this.expect(TokenType.IDENTIFIER).value;

        let initializer: AST.Expr | undefined;
        let arraySizeInit: AST.Expr | undefined;

        if (this.matchTok(TokenType.ASSIGN)) {
            initializer = this.parseExpr();
        } else if (typeRef.name === "array" && this.check(TokenType.LPAREN)) {
            this.advance();
            arraySizeInit = this.parseExpr();
            this.expect(TokenType.RPAREN);
        }

        this.expect(TokenType.SEMICOLON);
        return { kind: "VarDecl", typeRef, name, initializer, arraySizeInit, isConst, line };
    }

    private parseExprStmt(): AST.ExprStmt {
        const line = this.peek().line;
        const expr = this.parseExpr();
        this.expect(TokenType.SEMICOLON);
        return { kind: "ExprStmt", expr, line };
    }

    private parseIf(): AST.IfStmt {
        const line = this.advance().line;
        this.expect(TokenType.LPAREN);
        const condition = this.parseExpr();
        this.expect(TokenType.RPAREN);
        const then = this.parseStmt();
        let elseStmt: AST.Stmt | undefined;
        if (this.matchTok(TokenType.ELSE)) elseStmt = this.parseStmt();
        return { kind: "IfStmt", condition, then, else: elseStmt, line };
    }

    private parseFor(): AST.ForStmt {
        const line = this.advance().line;
        this.expect(TokenType.LPAREN);

        let init: AST.VarDecl | AST.ExprStmt | undefined;
        if (!this.check(TokenType.SEMICOLON)) {
            if (this.isTypeStart() || this.check(TokenType.CONST)) {
                init = this.parseLocalVarDecl();
            } else {
                init = this.parseExprStmt();
            }
        } else {
            this.expect(TokenType.SEMICOLON);
        }

        let condition: AST.Expr | undefined;
        if (!this.check(TokenType.SEMICOLON)) condition = this.parseExpr();
        this.expect(TokenType.SEMICOLON);

        let update: AST.Expr | undefined;
        if (!this.check(TokenType.RPAREN)) update = this.parseExpr();
        this.expect(TokenType.RPAREN);

        const body = this.parseStmt();
        return { kind: "ForStmt", init, condition, update, body, line };
    }

    private parseWhile(): AST.WhileStmt {
        const line = this.advance().line;
        this.expect(TokenType.LPAREN);
        const condition = this.parseExpr();
        this.expect(TokenType.RPAREN);
        const body = this.parseStmt();
        return { kind: "WhileStmt", condition, body, line };
    }

    private parseDoWhile(): AST.DoWhileStmt {
        const line = this.advance().line;
        const body = this.parseStmt();
        this.expect(TokenType.WHILE);
        this.expect(TokenType.LPAREN);
        const condition = this.parseExpr();
        this.expect(TokenType.RPAREN);
        this.expect(TokenType.SEMICOLON);
        return { kind: "DoWhileStmt", body, condition, line };
    }

    private parseReturn(): AST.ReturnStmt {
        const line = this.advance().line;
        let value: AST.Expr | undefined;
        if (!this.check(TokenType.SEMICOLON)) value = this.parseExpr();
        this.expect(TokenType.SEMICOLON);
        return { kind: "ReturnStmt", value, line };
    }

    private parseSwitch(): AST.SwitchStmt {
        const line = this.advance().line;
        this.expect(TokenType.LPAREN);
        const expr = this.parseExpr();
        this.expect(TokenType.RPAREN);
        this.expect(TokenType.LBRACE);

        const cases: AST.SwitchCase[] = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            let value: AST.Expr | undefined;
            if (this.matchTok(TokenType.CASE)) {
                value = this.parseExpr();
                this.expect(TokenType.COLON);
            } else if (this.matchTok(TokenType.DEFAULT)) {
                this.expect(TokenType.COLON);
            } else {
                this.error(`Expected 'case' or 'default'`);
            }

            const body: AST.Stmt[] = [];
            while (!this.check(TokenType.CASE) && !this.check(TokenType.DEFAULT) && !this.check(TokenType.RBRACE) && !this.isAtEnd()) {
                body.push(this.parseStmt());
            }
            cases.push({ value, body });
        }

        this.expect(TokenType.RBRACE);
        return { kind: "SwitchStmt", expr, cases, line };
    }

    private parseExpr(): AST.Expr {
        return this.parseAssign();
    }

    private parseAssign(): AST.Expr {
        const line = this.peek().line;

        if (this.check(TokenType.AT)) {
            this.advance();
            const target = this.parseOr();
            if (this.matchTok(TokenType.ASSIGN)) {
                this.matchTok(TokenType.AT);
                const value = this.parseOr();
                return { kind: "HandleAssignExpr", target, value, line };
            }
            return { kind: "UnaryExpr", op: "@", operand: target, prefix: true, line };
        }

        const left = this.parseTernary();

        if (ASSIGN_OPS.has(this.peek().type)) {
            const op = this.advance().value as AST.AssignExpr["op"];
            const value = this.parseAssign();
            return { kind: "AssignExpr", target: left, op, value, line };
        }

        return left;
    }

    private parseTernary(): AST.Expr {
        const line = this.peek().line;
        const condition = this.parseOr();
        if (this.matchTok(TokenType.QUESTION)) {
            const then = this.parseExpr();
            this.expect(TokenType.COLON);
            const elseExpr = this.parseExpr();
            return { kind: "TernaryExpr", condition, then, else: elseExpr, line };
        }
        return condition;
    }

    private parseOr(): AST.Expr {
        let left = this.parseAnd();
        while (this.check(TokenType.OR_OR)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseAnd(), line: this.peek().line };
        }
        return left;
    }

    private parseAnd(): AST.Expr {
        let left = this.parseBitOr();
        while (this.check(TokenType.AND_AND)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseBitOr(), line: this.peek().line };
        }
        return left;
    }

    private parseBitOr(): AST.Expr {
        let left = this.parseBitXor();
        while (this.check(TokenType.PIPE)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseBitXor(), line: this.peek().line };
        }
        return left;
    }

    private parseBitXor(): AST.Expr {
        let left = this.parseBitAnd();
        while (this.check(TokenType.CARET)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseBitAnd(), line: this.peek().line };
        }
        return left;
    }

    private parseBitAnd(): AST.Expr {
        let left = this.parseEquality();
        while (this.check(TokenType.AMP)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseEquality(), line: this.peek().line };
        }
        return left;
    }

    private parseEquality(): AST.Expr {
        let left = this.parseComparison();
        while (this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseComparison(), line: this.peek().line };
        }
        return left;
    }

    private parseComparison(): AST.Expr {
        let left = this.parseShift();
        while ([TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE].includes(this.peek().type)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseShift(), line: this.peek().line };
        }
        return left;
    }

    private parseShift(): AST.Expr {
        let left = this.parseAddSub();
        while (this.check(TokenType.LSHIFT) || this.check(TokenType.RSHIFT)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseAddSub(), line: this.peek().line };
        }
        return left;
    }

    private parseAddSub(): AST.Expr {
        let left = this.parseMulDiv();
        while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseMulDiv(), line: this.peek().line };
        }
        return left;
    }

    private parseMulDiv(): AST.Expr {
        let left = this.parseUnary();
        while (this.check(TokenType.STAR) || this.check(TokenType.SLASH) || this.check(TokenType.PERCENT)) {
            const op = this.advance().value;
            left = { kind: "BinaryExpr", left, op, right: this.parseUnary(), line: this.peek().line };
        }
        return left;
    }

    private parseUnary(): AST.Expr {
        const line = this.peek().line;
        if (this.check(TokenType.BANG)) { this.advance(); return { kind: "UnaryExpr", op: "!", operand: this.parseUnary(), prefix: true, line }; }
        if (this.check(TokenType.MINUS)) { this.advance(); return { kind: "UnaryExpr", op: "-", operand: this.parseUnary(), prefix: true, line }; }
        if (this.check(TokenType.TILDE)) { this.advance(); return { kind: "UnaryExpr", op: "~", operand: this.parseUnary(), prefix: true, line }; }
        if (this.check(TokenType.PLUS_PLUS)) { this.advance(); return { kind: "UnaryExpr", op: "++", operand: this.parsePostfix(), prefix: true, line }; }
        if (this.check(TokenType.MINUS_MINUS)) { this.advance(); return { kind: "UnaryExpr", op: "--", operand: this.parsePostfix(), prefix: true, line }; }
        return this.parsePostfix();
    }

    private parsePostfix(): AST.Expr {
        let expr = this.parsePrimary();
        while (true) {
            const line = this.peek().line;
            if (this.matchTok(TokenType.DOT)) {
                const member = this.expect(TokenType.IDENTIFIER).value;
                expr = { kind: "MemberExpr", object: expr, member, line };
            } else if (this.check(TokenType.LPAREN)) {
                this.advance();
                const args = this.parseArgs();
                this.expect(TokenType.RPAREN);
                expr = { kind: "CallExpr", callee: expr, args, line };
            } else if (this.check(TokenType.LBRACKET)) {
                this.advance();
                const index = this.parseExpr();
                this.expect(TokenType.RBRACKET);
                expr = { kind: "IndexExpr", object: expr, index, line };
            } else if (this.check(TokenType.PLUS_PLUS)) {
                this.advance();
                expr = { kind: "UnaryExpr", op: "++", operand: expr, prefix: false, line };
            } else if (this.check(TokenType.MINUS_MINUS)) {
                this.advance();
                expr = { kind: "UnaryExpr", op: "--", operand: expr, prefix: false, line };
            } else {
                break;
            }
        }
        return expr;
    }

    private parsePrimary(): AST.Expr {
        const tok = this.peek();
        const line = tok.line;

        if (tok.type === TokenType.INT_LITERAL) { this.advance(); return { kind: "IntLiteral", value: parseInt(tok.value), line }; }
        if (tok.type === TokenType.FLOAT_LITERAL) { this.advance(); return { kind: "FloatLiteral", value: parseFloat(tok.value), line }; }
        if (tok.type === TokenType.STRING_LITERAL) { this.advance(); return { kind: "StringLiteral", value: tok.value, line }; }
        if (tok.type === TokenType.BOOL_LITERAL) { this.advance(); return { kind: "BoolLiteral", value: tok.value === "true", line }; }
        if (tok.type === TokenType.TRUE) { this.advance(); return { kind: "BoolLiteral", value: true, line }; }
        if (tok.type === TokenType.FALSE) { this.advance(); return { kind: "BoolLiteral", value: false, line }; }
        if (tok.type === TokenType.NULL_KW) { this.advance(); return { kind: "NullLiteral", line }; }
        if (tok.type === TokenType.THIS) { this.advance(); return { kind: "Identifier", name: "this", line }; }

        if (tok.type === TokenType.NEW) {
            this.advance();
            const typeName = this.expect(TokenType.IDENTIFIER).value;
            this.expect(TokenType.LPAREN);
            const args = this.parseArgs();
            this.expect(TokenType.RPAREN);
            return { kind: "NewExpr", typeName, args, line };
        }

        if (tok.type === TokenType.LPAREN) {
            this.advance();
            const expr = this.parseExpr();
            this.expect(TokenType.RPAREN);
            return expr;
        }

        if (tok.type === TokenType.IDENTIFIER) {
            this.advance();
            if (this.check(TokenType.NAMESPACE)) {
                this.advance();
                const member = this.expect(TokenType.IDENTIFIER).value;
                return { kind: "MemberExpr", object: { kind: "Identifier", name: tok.value, line }, member, line };
            }
            return { kind: "Identifier", name: tok.value, line };
        }

        this.error(`Unexpected token '${tok.value}'`);
    }

    private parseArgs(): AST.Expr[] {
        const args: AST.Expr[] = [];
        if (this.check(TokenType.RPAREN)) return args;
        do {
            this.matchTok(TokenType.AT);
            args.push(this.parseExpr());
        } while (this.matchTok(TokenType.COMMA));
        return args;
    }

    private isTypeStart(): boolean {
        if (TYPE_TOKENS.has(this.peek().type)) return true;
        if (this.peek().type === TokenType.IDENTIFIER) {
            const next = this.tokens[this.pos + 1];
            if (!next) return false;
            return next.type === TokenType.IDENTIFIER || next.type === TokenType.AT;
        }
        return false;
    }

    private checkIdent(name: string): boolean {
        return this.peek().type === TokenType.IDENTIFIER && this.peek().value === name;
    }

    private check(type: TokenType): boolean { return this.peek().type === type; }

    private matchTok(type: TokenType): boolean {
        if (this.check(type)) { this.advance(); return true; }
        return false;
    }

    private advance(): Token { return this.tokens[this.pos++]!; }
    private peek(): Token { return this.tokens[this.pos]!; }

    private expect(type: TokenType): Token {
        if (!this.check(type)) {
            const tok = this.peek();
            this.error(`Expected ${TokenType[type]}, got '${tok.value}' (${TokenType[tok.type]})`);
        }
        return this.advance();
    }

    private isAtEnd(): boolean { return this.peek().type === TokenType.EOF; }

    private error(msg: string): never {
        const tok = this.peek();
        throw new ParseError(msg, tok.line, tok.col);
    }
}