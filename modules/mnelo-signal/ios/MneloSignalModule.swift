import ExpoModulesCore

public class MneloSignalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MneloSignal")
    Function("version") { "0.102.2" }
    AsyncFunction("run") { (encoded: String) throws -> String in
      try MneloSignalCore.run(encoded)
    }
  }
}
