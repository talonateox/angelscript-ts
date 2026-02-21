export interface TypeRef {
    name: string;
    isHandle: boolean;
    isConst: boolean;
    templateArg?: TypeRef;
}

export type TopLevelDecl =
    | FuncDecl
    | ClassDecl
    | VarDecl
    | EnumDecl;

export interface Program {
    kind: "Program";
    body: TopLevelDecl[];
}

export interface VarDecl {
    kind: "VarDecl";
    typeRef: TypeRef;
    name: string;
    initializer?: Expr;
    arraySizeInit?: Expr;
    isConst: boolean;
    line: number;
}

export interface FuncDecl {
    kind: "FuncDecl";
    returnType: TypeRef;
    name: string;
    params: Param[];
    body: Block;
    line: number;
}

export interface Param {
    typeRef: TypeRef;
    name: string;
    qualifier?: "in" | "out" | "inout";
}

export interface ClassDecl {
    kind: "ClassDecl";
    name: string;
    members: ClassMember[];
    line: number;
}

export type ClassMember = VarDecl | FuncDecl;

export interface EnumDecl {
    kind: "EnumDecl";
    name: string;
    values: { name: string; value?: Expr }[];
    line: number;
}

export type Stmt =
    | Block
    | VarDecl
    | ExprStmt
    | IfStmt
    | ForStmt
    | WhileStmt
    | DoWhileStmt
    | ReturnStmt
    | BreakStmt
    | ContinueStmt
    | SwitchStmt;

export interface Block {
    kind: "Block";
    body: Stmt[];
    line: number;
}

export interface ExprStmt {
    kind: "ExprStmt";
    expr: Expr;
    line: number;
}

export interface IfStmt {
    kind: "IfStmt";
    condition: Expr;
    then: Stmt;
    else?: Stmt;
    line: number;
}

export interface ForStmt {
    kind: "ForStmt";
    init?: VarDecl | ExprStmt;
    condition?: Expr;
    update?: Expr;
    body: Stmt;
    line: number;
}

export interface WhileStmt {
    kind: "WhileStmt";
    condition: Expr;
    body: Stmt;
    line: number;
}

export interface DoWhileStmt {
    kind: "DoWhileStmt";
    body: Stmt;
    condition: Expr;
    line: number;
}

export interface ReturnStmt {
    kind: "ReturnStmt";
    value?: Expr;
    line: number;
}

export interface BreakStmt {
    kind: "BreakStmt";
    line: number;
}

export interface ContinueStmt {
    kind: "ContinueStmt";
    line: number;
}

export interface SwitchStmt {
    kind: "SwitchStmt";
    expr: Expr;
    cases: SwitchCase[];
    line: number;
}

export interface SwitchCase {
    value?: Expr;
    body: Stmt[];
}

export type Expr =
    | IntLiteral
    | FloatLiteral
    | StringLiteral
    | BoolLiteral
    | NullLiteral
    | Identifier
    | AssignExpr
    | BinaryExpr
    | UnaryExpr
    | CallExpr
    | MemberExpr
    | IndexExpr
    | NewExpr
    | CastExpr
    | TernaryExpr
    | HandleAssignExpr;

export interface IntLiteral { kind: "IntLiteral"; value: number; line: number; }
export interface FloatLiteral { kind: "FloatLiteral"; value: number; line: number; }
export interface StringLiteral { kind: "StringLiteral"; value: string; line: number; }
export interface BoolLiteral { kind: "BoolLiteral"; value: boolean; line: number; }
export interface NullLiteral { kind: "NullLiteral"; line: number; }
export interface Identifier { kind: "Identifier"; name: string; line: number; }

export interface AssignExpr {
    kind: "AssignExpr";
    target: Expr;
    op: "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=";
    value: Expr;
    line: number;
}

export interface HandleAssignExpr {
    kind: "HandleAssignExpr";
    target: Expr;
    value: Expr;
    line: number;
}

export interface BinaryExpr { kind: "BinaryExpr"; left: Expr; op: string; right: Expr; line: number; }
export interface UnaryExpr { kind: "UnaryExpr"; op: string; operand: Expr; prefix: boolean; line: number; }
export interface CallExpr { kind: "CallExpr"; callee: Expr; args: Expr[]; line: number; }
export interface MemberExpr { kind: "MemberExpr"; object: Expr; member: string; line: number; }
export interface IndexExpr { kind: "IndexExpr"; object: Expr; index: Expr; line: number; }
export interface NewExpr { kind: "NewExpr"; typeName: string; args: Expr[]; line: number; }
export interface CastExpr { kind: "CastExpr"; targetType: TypeRef; expr: Expr; line: number; }
export interface TernaryExpr { kind: "TernaryExpr"; condition: Expr; then: Expr; else: Expr; line: number; }