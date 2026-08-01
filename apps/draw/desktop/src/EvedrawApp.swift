import AppKit
import AuthenticationServices
import Darwin
import WebKit

private let origin = URL(string: "http://127.0.0.1:43117")!
private let requiredKeys = ["EVE_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "EVE_OWNER_USER_ID"]
private let authCallbackNotification = Notification.Name("com.evedraw.desktop.auth-callback")

enum LaunchFailure: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self { case .message(let text): return text }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate,
                         ASWebAuthenticationPresentationContextProviding {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var server: Process?
    private var clerkFrontendHost: String?
    private var pendingCallback: URL?
    private var authSession: ASWebAuthenticationSession?
    private var stopping = false
    private let configPath = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".evedraw/.env")

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        DistributedNotificationCenter.default().addObserver(
            self,
            selector: #selector(receiveAuthCallback(_:)),
            name: authCallbackNotification,
            object: nil
        )
        showStartingWindow()
        start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        DistributedNotificationCenter.default().removeObserver(self)
        stopServer()
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let callback = urls.first,
              callback.scheme == "evedraw" || callback.scheme == "com.evedraw.desktop" else { return }
        // LaunchServices may choose another registered copy of Eve (for example a
        // packaged development build). Broadcast the callback so the copy that
        // owns the visible window and local server receives it as well.
        DistributedNotificationCenter.default().postNotificationName(
            authCallbackNotification,
            object: callback.absoluteString,
            userInfo: nil,
            deliverImmediately: true
        )
    }

    @objc private func receiveAuthCallback(_ notification: Notification) {
        guard let value = notification.object as? String,
              let callback = URL(string: value),
              callback.scheme == "evedraw" || callback.scheme == "com.evedraw.desktop" else { return }
        handleCallback(callback)
    }

    private func handleCallback(_ callback: URL) {
        guard webView != nil else {
            pendingCallback = callback
            return
        }
        var components = URLComponents(url: origin.appendingPathComponent("desktop-auth/complete"), resolvingAgainstBaseURL: false)
        components?.query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.query
        if let url = components?.url { webView?.load(URLRequest(url: url)) }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func startBrowserAuthentication() {
        guard let url = URL(string: "http://127.0.0.1:43117/login?browser=1") else { return }
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "evedraw") { [weak self] callback, error in
            DispatchQueue.main.async {
                self?.authSession = nil
                if let callback {
                    self?.handleCallback(callback)
                } else if let failure = error as NSError?,
                          failure.code != ASWebAuthenticationSessionError.canceledLogin.rawValue {
                    self?.showFailure("Sign-in could not be completed.\n\n\(failure.localizedDescription)")
                }
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authSession = session
        if !session.start() {
            authSession = nil
            showFailure("The secure browser sign-in session could not be started.")
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        window ?? ASPresentationAnchor()
    }

    private func showStartingWindow() {
        let label = NSTextField(labelWithString: "Starting Evedraw…")
        label.font = .systemFont(ofSize: 18, weight: .medium)
        label.alignment = .center
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 240),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Evedraw"
        window.contentView = label
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)
    }

    private func start() {
        stopServer()
        do {
            let environment = try loadConfiguration()
            clerkFrontendHost = clerkHost(from: environment["EVE_CLERK_PUBLISHABLE_KEY", default: ""])
            try assertPortAvailable()
            try launchServer(environment: environment)
            waitUntilReady(attempt: 0)
        } catch {
            showFailure(error.localizedDescription)
        }
    }

    private func loadConfiguration() throws -> [String: String] {
        let manager = FileManager.default
        let directory = configPath.deletingLastPathComponent()
        guard manager.fileExists(atPath: configPath.path) else {
            throw LaunchFailure.message("Configuration is missing.\n\nExpected: \(configPath.path)")
        }
        let directoryMode = try posixMode(directory)
        guard directoryMode == 0o700 else {
            throw LaunchFailure.message("Unsafe configuration directory permissions.\n\n\(directory.path) must use mode 0700 (currently \(octal(directoryMode))).")
        }
        let fileMode = try posixMode(configPath)
        guard fileMode == 0o600 else {
            throw LaunchFailure.message("Unsafe configuration file permissions.\n\n\(configPath.path) must use mode 0600 (currently \(octal(fileMode))).")
        }
        let text = try String(contentsOf: configPath, encoding: .utf8)
        let values = try parseDotEnv(text)
        let missing = requiredKeys.filter { values[$0, default: ""].isEmpty }
        if !missing.isEmpty {
            throw LaunchFailure.message("Missing required variables in \(configPath.path):\n\n\(missing.joined(separator: "\n"))")
        }
        guard values["EVE_CLERK_PUBLISHABLE_KEY"]?.hasPrefix("pk_") == true else {
            throw LaunchFailure.message("EVE_CLERK_PUBLISHABLE_KEY is malformed in \(configPath.path).")
        }
        guard values["CLERK_SECRET_KEY"]?.hasPrefix("sk_") == true else {
            throw LaunchFailure.message("CLERK_SECRET_KEY is malformed in \(configPath.path).")
        }
        guard values["EVE_OWNER_USER_ID"]?.hasPrefix("user_") == true else {
            throw LaunchFailure.message("EVE_OWNER_USER_ID is malformed in \(configPath.path).")
        }
        guard !(values["CURSOR_API_KEY", default: ""].isEmpty && values["OLLAMA_API_KEY", default: ""].isEmpty) else {
            throw LaunchFailure.message("At least one provider variable is required in \(configPath.path):\n\nCURSOR_API_KEY\nOLLAMA_API_KEY")
        }
        return values
    }

    private func posixMode(_ url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let permissions = attributes[.posixPermissions] as? NSNumber else {
            throw LaunchFailure.message("Could not inspect permissions for \(url.path).")
        }
        return permissions.intValue & 0o777
    }

    private func octal(_ mode: Int) -> String { String(format: "%04o", mode) }

    private func clerkHost(from publishableKey: String) -> String? {
        guard let separator = publishableKey.lastIndex(of: "_") else { return nil }
        var encoded = String(publishableKey[publishableKey.index(after: separator)...])
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded),
              let decoded = String(data: data, encoding: .utf8) else { return nil }
        return decoded.trimmingCharacters(in: CharacterSet(charactersIn: "$"))
    }

    private func parseDotEnv(_ text: String) throws -> [String: String] {
        var result: [String: String] = [:]
        for (index, rawLine) in text.split(whereSeparator: \.isNewline).enumerated() {
            var line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("#") { continue }
            if line.hasPrefix("export ") { line.removeFirst(7) }
            guard let separator = line.firstIndex(of: "=") else {
                throw LaunchFailure.message("Malformed configuration at \(configPath.path):\(index + 1).")
            }
            let key = line[..<separator].trimmingCharacters(in: .whitespaces)
            var value = line[line.index(after: separator)...].trimmingCharacters(in: .whitespaces)
            if value.count >= 2,
               (value.first == "\"" && value.last == "\"" || value.first == "'" && value.last == "'") {
                value.removeFirst(); value.removeLast()
            }
            guard key.range(of: "^[A-Z][A-Z0-9_]*$", options: .regularExpression) != nil else {
                throw LaunchFailure.message("Malformed variable name at \(configPath.path):\(index + 1).")
            }
            result[key] = value
        }
        return result
    }

    private func assertPortAvailable() throws {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw LaunchFailure.message("Could not inspect local port 43117.") }
        defer { close(descriptor) }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(43117).bigEndian
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        let status = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        if status == 0 {
            throw LaunchFailure.message("Port 43117 is already in use. Quit the process using it, then retry.")
        }
        guard errno == ECONNREFUSED else {
            throw LaunchFailure.message("Could not inspect local port 43117 (error \(errno)).")
        }
    }

    private func resourceRoot() throws -> URL {
        if let override = ProcessInfo.processInfo.environment["EVEDRAW_DESKTOP_RESOURCE_ROOT"] {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        guard let resources = Bundle.main.resourceURL else {
            throw LaunchFailure.message("Evedraw's bundled resources could not be found.")
        }
        return resources
    }

    private func launchServer(environment values: [String: String]) throws {
        let assets = try resourceRoot().appendingPathComponent("assets", isDirectory: true)
        let node = assets.appendingPathComponent("node/bin/node")
        let serverFile = assets.appendingPathComponent("server/apps/draw/web/server.js")
        guard FileManager.default.isExecutableFile(atPath: node.path), FileManager.default.fileExists(atPath: serverFile.path) else {
            throw LaunchFailure.message("Evedraw's bundled Node runtime or standalone server is missing.")
        }
        let process = Process()
        process.executableURL = node
        process.arguments = [serverFile.path]
        process.currentDirectoryURL = serverFile.deletingLastPathComponent()
        var environment = ProcessInfo.processInfo.environment
        values.forEach { environment[$0.key] = $0.value }
        environment["HOSTNAME"] = "127.0.0.1"
        environment["PORT"] = "43117"
        environment["NODE_ENV"] = "production"
        environment["EVEDRAW_DESKTOP"] = "1"
        process.environment = environment
        let log = FileHandle(forWritingAtPath: "/dev/null")
        process.standardOutput = log
        process.standardError = log
        process.terminationHandler = { [weak self] child in
            DispatchQueue.main.async {
                guard let self, !self.stopping, self.server === child else { return }
                self.showFailure("The local Evedraw server exited unexpectedly (status \(child.terminationStatus)).")
            }
        }
        try process.run()
        server = process
    }

    private func waitUntilReady(attempt: Int) {
        guard attempt < 120, server?.isRunning == true else {
            showFailure("The local Evedraw server did not become ready within 30 seconds.")
            return
        }
        URLSession.shared.dataTask(with: origin.appendingPathComponent("api/readiness")) { [weak self] _, response, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if response != nil { self.showWebView() }
                else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitUntilReady(attempt: attempt + 1) } }
            }
        }.resume()
    }

    private func showWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        window?.contentView = webView
        window?.setContentSize(NSSize(width: 1180, height: 780))
        window?.center()
        webView.load(URLRequest(url: origin.appendingPathComponent("login")))
        self.webView = webView
        if let callback = pendingCallback {
            pendingCallback = nil
            handleCallback(callback)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame?.isMainFrame == true,
              let url = navigationAction.request.url else {
            decisionHandler(.allow); return
        }
        if url.scheme == "evedraw" || url.scheme == "com.evedraw.desktop" {
            handleCallback(url)
            decisionHandler(.cancel)
        } else if url.scheme == "evedraw-auth" {
            startBrowserAuthentication()
            decisionHandler(.cancel)
        } else if (url.scheme == "http" || url.scheme == "https") &&
                    (url.host == origin.host || url.host == clerkFrontendHost) {
            decisionHandler(.allow)
        } else if url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        let failure = error as NSError
        if failure.domain == "WebKitErrorDomain" && failure.code == 102 { return }
        if failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled { return }
        showFailure("Eve's local page could not be loaded.\n\n\(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!,
                 withError error: Error) {
        let failure = error as NSError
        if failure.domain == "WebKitErrorDomain" && failure.code == 102 { return }
        if failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled { return }
        showFailure("Eve's local page stopped loading.\n\n\(error.localizedDescription)")
    }


    private func showFailure(_ detail: String) {
        stopServer()
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Eve could not start"
        alert.informativeText = detail
        alert.addButton(withTitle: "Retry")
        alert.addButton(withTitle: "Quit")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn { start() } else { NSApp.terminate(nil) }
    }

    private func stopServer() {
        guard let process = server else { return }
        server = nil
        if process.isRunning {
            process.terminate()
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
                if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            }
        }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
