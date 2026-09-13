//
//  SocketConnection.swift
//  Broadcast Extension
//
//  Created by Alex-Dan Bumbu on 22/03/2021.
//  Copyright © 2021 Atlassian Inc. All rights reserved.
//

// A bounded, nonblocking local socket. All descriptor operations use one queue.
import Foundation
import Darwin

class SocketConnection {
    var didOpen: (() -> Void)?
    var didClose: ((Error?) -> Void)?
    var streamHasSpaceAvailable: (() -> Void)?
    private let filePath: String
    private let queue = DispatchQueue(label: "com.mnelo.broadcast.socket")
    private var descriptor: Int32 = -1
    private var stopped = false
    private var readSource: DispatchSourceRead?
    private var writeSource: DispatchSourceWrite?

    init?(filePath: String) {
        guard filePath.utf8.count < 104 else { return nil }
        self.filePath = filePath
    }
    func open() -> Bool {
        queue.sync {
            guard !stopped else { return false }
            if descriptor >= 0 { return true }
            let socket = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
            guard socket >= 0 else { return false }
            var address = sockaddr_un()
            address.sun_family = sa_family_t(AF_UNIX)
            address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
            withUnsafeMutablePointer(to: &address.sun_path.0) { pointer in
                filePath.withCString { _ = strcpy(pointer, $0) }
            }
            let connected = withUnsafePointer(to: &address) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
                }
            }
            guard connected == 0 else { Darwin.close(socket); return false }
            var noSignal: Int32 = 1
            guard setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size)) == 0,
                fcntl(socket, F_SETFL, fcntl(socket, F_GETFL) | O_NONBLOCK) == 0 else {
                Darwin.close(socket); return false
            }
            descriptor = socket
            let source = DispatchSource.makeReadSource(fileDescriptor: socket, queue: queue)
            readSource = source
            source.setEventHandler { [weak self] in
                guard let self, self.descriptor == socket else { return }
                var bytes = [UInt8](repeating: 0, count: 256)
                let count = Darwin.read(socket, &bytes, bytes.count)
                if count == 0 || (count < 0 && errno != EAGAIN && errno != EINTR) {
                    self.closeOnQueue()
                    DispatchQueue.global().async { [weak self] in self?.didClose?(nil) }
                }
            }
            source.resume()
            didOpen?()
            return true
        }
    }
    func close() { queue.sync { stopped = true; closeOnQueue() } }
    private func closeOnQueue() {
        readSource?.cancel(); readSource = nil
        writeSource?.cancel(); writeSource = nil
        if descriptor >= 0 { Darwin.close(descriptor); descriptor = -1 }
    }
    func writeToStream(buffer: UnsafePointer<UInt8>, maxLength: Int) -> Int {
        queue.sync {
            guard descriptor >= 0, !stopped else { return 0 }
            let count = Darwin.write(descriptor, buffer, maxLength)
            if count < 0 && (errno == EAGAIN || errno == EINTR) {
                if writeSource == nil {
                    let source = DispatchSource.makeWriteSource(fileDescriptor: descriptor, queue: queue)
                    writeSource = source
                    source.setEventHandler { [weak self] in
                        guard let self else { return }
                        self.writeSource?.cancel(); self.writeSource = nil
                        self.streamHasSpaceAvailable?()
                    }
                    source.resume()
                }
                return 0
            }
            if count < 0 {
                closeOnQueue()
                DispatchQueue.global().async { [weak self] in self?.didClose?(nil) }
            }
            return count
        }
    }
}
