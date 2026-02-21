export enum TokenType {
    INT_LITERAL,
    FLOAT_LITERAL,
    STRING_LITERAL,
    BOOL_LITERAL,

    IDENTIFIER,

    IF, ELSE, FOR, WHILE, DO, RETURN, BREAK, CONTINUE,
    CLASS, VOID, NEW, NULL_KW, THIS,
    CONST, TRUE, FALSE,
    AND, OR, NOT,
    SWITCH, CASE, DEFAULT,

    INT, UINT, INT8, INT16, INT64,
    UINT8, UINT16, UINT64,
    FLOAT, DOUBLE, BOOL, STRING,

    AT,
    AT_AT,

    PLUS, MINUS, STAR, SLASH, PERCENT,
    AMP,
    PIPE,
    CARET,
    TILDE,
    LSHIFT,
    RSHIFT,

    ASSIGN,
    PLUS_ASSIGN,
    MINUS_ASSIGN,
    STAR_ASSIGN,
    SLASH_ASSIGN,
    PERCENT_ASSIGN,
    AMP_ASSIGN,
    PIPE_ASSIGN,
    CARET_ASSIGN,

    EQ, NEQ, LT, GT, LTE, GTE,

    AND_AND,
    OR_OR,
    BANG,

    PLUS_PLUS,
    MINUS_MINUS,

    LPAREN, RPAREN,
    LBRACE, RBRACE,
    LBRACKET, RBRACKET,
    SEMICOLON, COLON, COMMA, DOT,
    QUESTION,
    NAMESPACE,

    EOF,
}

export const KEYWORDS: Record<string, TokenType> = {
    if: TokenType.IF,
    else: TokenType.ELSE,
    for: TokenType.FOR,
    while: TokenType.WHILE,
    do: TokenType.DO,
    return: TokenType.RETURN,
    break: TokenType.BREAK,
    continue: TokenType.CONTINUE,
    class: TokenType.CLASS,
    void: TokenType.VOID,
    new: TokenType.NEW,
    null: TokenType.NULL_KW,
    this: TokenType.THIS,
    const: TokenType.CONST,
    true: TokenType.TRUE,
    false: TokenType.FALSE,
    and: TokenType.AND,
    or: TokenType.OR,
    not: TokenType.NOT,
    switch: TokenType.SWITCH,
    case: TokenType.CASE,
    default: TokenType.DEFAULT,
    int: TokenType.INT,
    uint: TokenType.UINT,
    int8: TokenType.INT8,
    int16: TokenType.INT16,
    int64: TokenType.INT64,
    uint8: TokenType.UINT8,
    uint16: TokenType.UINT16,
    uint64: TokenType.UINT64,
    float: TokenType.FLOAT,
    double: TokenType.DOUBLE,
    bool: TokenType.BOOL,
    string: TokenType.STRING,
};

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    col: number;
}