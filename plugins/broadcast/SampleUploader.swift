//
//  SampleUploader.swift
//  Broadcast Extension
//
//  Created by Alex-Dan Bumbu on 22/03/2021.
//  Copyright © 2021 8x8, Inc. All rights reserved.
//

// Mnelo bounds capture to one queued JPEG frame; newer frames are dropped while busy.
import Foundation
import ReplayKit

class SampleUploader {
    private static let imageContext = CIContext(options: [.cacheIntermediates: false])
    private let connection: SocketConnection
    private let serialQueue = DispatchQueue(label: "com.mnelo.broadcast.writer")
    private let availableFrame = DispatchSemaphore(value: 1)
    private var dataToSend: Data?
    private var byteIndex = 0

    init(connection: SocketConnection) {
        self.connection = connection
        connection.didOpen = { [weak self] in self?.drain() }
        connection.streamHasSpaceAvailable = { [weak self] in self?.drain() }
    }
    @discardableResult func send(sample buffer: CMSampleBuffer) -> Bool {
        guard availableFrame.wait(timeout: .now()) == .success else { return false }
        guard let data = prepare(sample: buffer) else { availableFrame.signal(); return false }
        serialQueue.async { [weak self] in
            guard let self else { return }
            self.dataToSend = data
            self.byteIndex = 0
            self.sendDataChunk()
        }
        return true
    }
    private func drain() {
        serialQueue.async { [weak self] in self?.sendDataChunk() }
    }
    private func sendDataChunk() {
        while let data = dataToSend {
        let length = min(10240, data.count - byteIndex)
        let written = data[byteIndex..<(byteIndex + length)].withUnsafeBytes {
            guard let pointer = $0.bindMemory(to: UInt8.self).baseAddress else { return 0 }
            return connection.writeToStream(buffer: pointer, maxLength: length)
        }
        if written > 0 { byteIndex += written }
        if byteIndex == data.count || written < 0 {
            dataToSend = nil
            byteIndex = 0
            availableFrame.signal()
        }
        if written <= 0 { return }
        }
    }
}
private extension SampleUploader {
    func prepare(sample buffer: CMSampleBuffer) -> Data? {
        guard let imageBuffer = CMSampleBufferGetImageBuffer(buffer) else {
            return nil
        }

        CVPixelBufferLockBaseAddress(imageBuffer, .readOnly)

        let originalWidth = CVPixelBufferGetWidth(imageBuffer)
        let originalHeight = CVPixelBufferGetHeight(imageBuffer)
        let factor = min(1.0, 1280.0 / Double(max(originalWidth, originalHeight)))
        let width = max(1, Int(Double(originalWidth) * factor))
        let height = max(1, Int(Double(originalHeight) * factor))
        let orientation = CMGetAttachment(buffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil)?.uintValue ?? 0

        let scaleTransform = CGAffineTransform(scaleX: CGFloat(width)/CGFloat(originalWidth), y: CGFloat(height)/CGFloat(originalHeight))
        let bufferData = self.jpegData(from: imageBuffer, scale: scaleTransform)

        CVPixelBufferUnlockBaseAddress(imageBuffer, .readOnly)

        guard let messageData = bufferData else {
            return nil
        }

        let httpResponse = CFHTTPMessageCreateResponse(nil, 200, nil, kCFHTTPVersion1_1).takeRetainedValue()
        CFHTTPMessageSetHeaderFieldValue(httpResponse, "Content-Length" as CFString, String(messageData.count) as CFString)
        CFHTTPMessageSetHeaderFieldValue(httpResponse, "Buffer-Width" as CFString, String(width) as CFString)
        CFHTTPMessageSetHeaderFieldValue(httpResponse, "Buffer-Height" as CFString, String(height) as CFString)
        CFHTTPMessageSetHeaderFieldValue(httpResponse, "Buffer-Orientation" as CFString, String(orientation) as CFString)

        CFHTTPMessageSetBody(httpResponse, messageData as CFData)

        let serializedMessage = CFHTTPMessageCopySerializedMessage(httpResponse)?.takeRetainedValue() as Data?

        return serializedMessage
    }

    func jpegData(from buffer: CVPixelBuffer, scale scaleTransform: CGAffineTransform) -> Data? {
        let image = CIImage(cvPixelBuffer: buffer).transformed(by: scaleTransform)

        let colorSpace = image.colorSpace ?? CGColorSpaceCreateDeviceRGB()

        let options: [CIImageRepresentationOption: Float] = [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.75]

        return SampleUploader.imageContext.jpegRepresentation(of: image, colorSpace: colorSpace, options: options)
    }
}
