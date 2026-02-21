import { Token, TokenType, KEYWORDS } from "./token";

export class LexerError extends Error {
    constructor(message: string, public line: number, public col: number) {
        super(`[Lexer] ${message} at ${line}:${col}`);
    }
}

export class Lexer {
    private pos = 0;
    private line = 1;
    private col = 1;
    private tokens: Token[] = [];

    constructor(private source: string) { }

    tokenize(): Token[] {
        while (!this.isAtEnd()) {
            this.skipWhitespaceAndComments();
            if (this.isAtEnd()) break;
            this.readToken();
        }

        this.tokens.push({ type: TokenType.EOF, value: "", line: this.line, col: this.col });
        return this.tokens;
    }

    private readToken() {
        const startLine = this.line;
        const startCol = this.col;
        const ch = this.advance();

        const push = (type: TokenType, value: string = ch) =>
            this.tokens.push({ type, value, line: startLine, col: startCol });

        if (ch === '"' || ch === "'") {
            this.readString(ch, startLine, startCol);
            return;
        }

        if (this.isDigit(ch)) {
            this.readNumber(ch, startLine, startCol);
            return;
        }

        if (this.isAlpha(ch)) {
            this.readIdentifier(ch, startLine, startCol);
            return;
        }

        switch (ch) {
            case "+":
                if (this.match("+")) push(TokenType.PLUS_PLUS, "++");
                else if (this.match("=")) push(TokenType.PLUS_ASSIGN, "+=");
                else push(TokenType.PLUS);
                break;
            case "-":
                if (this.match("-")) push(TokenType.MINUS_MINUS, "--");
                else if (this.match("=")) push(TokenType.MINUS_ASSIGN, "-=");
                else push(TokenType.MINUS);
                break;
            case "*":
                if (this.match("=")) push(TokenType.STAR_ASSIGN, "*=");
                else push(TokenType.STAR);
                break;
            case "/":
                if (this.match("=")) push(TokenType.SLASH_ASSIGN, "/=");
                else push(TokenType.SLASH);
                break;
            case "%":
                if (this.match("=")) push(TokenType.PERCENT_ASSIGN, "%=");
                else push(TokenType.PERCENT);
                break;
            case "&":
                if (this.match("&")) push(TokenType.AND_AND, "&&");
                else if (this.match("=")) push(TokenType.AMP_ASSIGN, "&=");
                else push(TokenType.AMP);
                break;
            case "|":
                if (this.match("|")) push(TokenType.OR_OR, "||");
                else if (this.match("=")) push(TokenType.PIPE_ASSIGN, "|=");
                else push(TokenType.PIPE);
                break;
            case "^":
                if (this.match("=")) push(TokenType.CARET_ASSIGN, "^=");
                else push(TokenType.CARET);
                break;
            case "~": push(TokenType.TILDE); break;
            case "!":
                if (this.match("=")) push(TokenType.NEQ, "!=");
                else push(TokenType.BANG);
                break;
            case "=":
                if (this.match("=")) push(TokenType.EQ, "==");
                else push(TokenType.ASSIGN);
                break;
            case "<":
                if (this.match("<")) push(TokenType.LSHIFT, "<<");
                else if (this.match("=")) push(TokenType.LTE, "<=");
                else push(TokenType.LT);
                break;
            case ">":
                if (this.match(">")) push(TokenType.RSHIFT, ">>");
                else if (this.match("=")) push(TokenType.GTE, ">=");
                else push(TokenType.GT);
                break;
            case "@":
                if (this.match("@")) push(TokenType.AT_AT, "@@");
                else push(TokenType.AT);
                break;
            case ":":
                if (this.match(":")) push(TokenType.NAMESPACE, "::");
                else push(TokenType.COLON);
                break;
            case "(": push(TokenType.LPAREN); break;
            case ")": push(TokenType.RPAREN); break;
            case "{": push(TokenType.LBRACE); break;
            case "}": push(TokenType.RBRACE); break;
            case "[": push(TokenType.LBRACKET); break;
            case "]": push(TokenType.RBRACKET); break;
            case ";": push(TokenType.SEMICOLON); break;
            case ",": push(TokenType.COMMA); break;
            case ".": push(TokenType.DOT); break;
            case "?": push(TokenType.QUESTION); break;
            default:
                throw new LexerError(`Unexpected character '${ch}'`, startLine, startCol);
        }
    }

    private readString(quote: string, line: number, col: number) {
        let value = "";
        while (!this.isAtEnd() && this.peek() !== quote) {
            if (this.peek() === "\n") { this.line++; this.col = 1; }
            if (this.peek() === "\\") {
                this.advance();
                const esc = this.advance();
                switch (esc) {
                    case "n": value += "\n"; break;
                    case "t": value += "\t"; break;
                    case "r": value += "\r"; break;
                    default: value += esc;
                }
            } else {
                value += this.advance();
            }
        }

        if (this.isAtEnd()) throw new LexerError("Unterminated string", line, col);
        this.advance();
        this.tokens.push({ type: TokenType.STRING_LITERAL, value, line, col });
    }

    private readNumber(first: string, line: number, col: number) {
        let value = first;
        let isFloat = false;

        while (!this.isAtEnd() && this.isDigit(this.peek())) {
            value += this.advance();
        }

        if (!this.isAtEnd() && this.peek() === "." && this.isDigit(this.peekNext())) {
            isFloat = true;
            value += this.advance();
            while (!this.isAtEnd() && this.isDigit(this.peek())) {
                value += this.advance();
            }
        }

        if (!this.isAtEnd() && this.peek() === "f") {
            this.advance();
            isFloat = true;
        }

        this.tokens.push({
            type: isFloat ? TokenType.FLOAT_LITERAL : TokenType.INT_LITERAL,
            value,
            line,
            col,
        });
    }

    private readIdentifier(first: string, line: number, col: number) {
        let value = first;
        while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
            value += this.advance();
        }

        const kwType = KEYWORDS[value];
        if (kwType !== undefined) {
            if (value === "true" || value === "false") {
                this.tokens.push({ type: TokenType.BOOL_LITERAL, value, line, col });
            } else {
                this.tokens.push({ type: kwType, value, line, col });
            }
        } else {
            this.tokens.push({ type: TokenType.IDENTIFIER, value, line, col });
        }
    }

    private skipWhitespaceAndComments() {
        while (!this.isAtEnd()) {
            const ch = this.peek();

            if (ch === " " || ch === "\r" || ch === "\t") {
                this.advance();
            } else if (ch === "\n") {
                this.advance();
                this.line++;
                this.col = 1;
            } else if (ch === "/" && this.peekNext() === "/") {
                while (!this.isAtEnd() && this.peek() !== "\n") this.advance();
            } else if (ch === "/" && this.peekNext() === "*") {
                this.advance(); this.advance();
                while (!this.isAtEnd()) {
                    if (this.peek() === "\n") { this.line++; this.col = 1; }
                    if (this.peek() === "*" && this.peekNext() === "/") {
                        this.advance(); this.advance();
                        break;
                    }
                    this.advance();
                }
            } else {
                break;
            }
        }
    }

    private advance(): string {
        const ch = this.source[this.pos++];
        this.col++;
        return ch ?? "";
    }

    private match(expected: string): boolean {
        if (this.isAtEnd() || this.source[this.pos] !== expected) return false;
        this.advance();
        return true;
    }

    private peek(): string { return this.source[this.pos] ?? ""; }
    private peekNext(): string { return this.source[this.pos + 1] ?? ""; }
    private isAtEnd(): boolean { return this.pos >= this.source.length; }
    private isDigit(ch: string): boolean { return ch >= "0" && ch <= "9"; }
    private isAlpha(ch: string): boolean { return /[a-zA-Z_]/.test(ch); }
    private isAlphaNumeric(ch: string): boolean { return /[a-zA-Z0-9_]/.test(ch); }
}