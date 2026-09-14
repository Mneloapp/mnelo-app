import Foundation

// Ephemeral requests to the configured Mnelo identity/delivery origin only.
// Reject redirects and bound bytes while reading, not after an unbounded load.
final class ShareNetwork: NSObject, URLSessionDataDelegate {
  // Native tests supply a loopback URLProtocol without changing TLS trust.
  static var makeConfiguration: () -> URLSessionConfiguration = { .ephemeral }
  private var session: URLSession?
  private var task: URLSessionDataTask?
  private var bytes = Data()
  private var status = 0
  private var limit = 0
  private let completion: (String) -> Void
  init(url: URL, body: String, completion: @escaping (String) -> Void) {
    self.completion = completion
    super.init()
    limit = url.path == "/delivery" ? 2_000_000 : 16384
    let configuration = Self.makeConfiguration()
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.timeoutIntervalForRequest = 15
    configuration.timeoutIntervalForResource = 20
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = Data(body.utf8)
    task = session.dataTask(with: request)
    task?.resume()
  }
  func cancel() { task?.cancel() }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let response = response as? HTTPURLResponse, response.expectedContentLength <= limit else { completionHandler(.cancel); return }
    status = response.statusCode
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard bytes.count + data.count <= limit else { dataTask.cancel(); return }
    bytes.append(data)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let result: [String: Any]
    if error == nil, let text = String(data: bytes, encoding: .utf8) { result = ["status": status, "text": text] }
    else { result = ["error": "PHONE_REQUEST_FAILED"] }
    completion(shareJSON(result))
    bytes.removeAll()
    session.finishTasksAndInvalidate()
    self.session = nil; self.task = nil
  }
}
