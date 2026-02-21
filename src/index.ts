import { ScriptEngine } from "./runtime/bindings";

const engine = new ScriptEngine();

engine.load(`
class TestClass {

}

TestClass g_ca_timelimit1v1(string, string);
Cvar g_ca_timelimit1v1( "g_ca_timelimit1v1", "60", 0 );

`);

// engine.call("mainTest", [INT(12)]);