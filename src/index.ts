import { ScriptEngine, stringify, INT } from "./runtime/bindings";

const engine = new ScriptEngine();

engine.load(`
class TestClass {
    int int1lmao;

    TestClass(int initialValue) {
        int1lmao = initialValue;
    }

    void incrementIt() {
        int1lmao++;
    }
}

void mainTest(int initialValue) {
    TestClass testClass = new TestClass(initialValue);

    testClass.incrementIt();
    G_Print(testClass.int1lmao);
    testClass.incrementIt();
    G_Print(testClass.int1lmao);
    testClass.incrementIt();
    G_Print(testClass.int1lmao);
}
`);

engine.registerFunction("G_Print", (msg) => {
    console.log("G_Print:", stringify(msg));
    return { kind: "void" as const };
});

engine.call("mainTest", [INT(12)]);