import UIKit

// A share-sheet dismissal is not proof of saving. Only the Files export delegate
// can authorize the JS side's subsequent, snapshot-checked local deletion.
final class MneloExportPicker: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private var completion: ((Bool) -> Void)?
  init(completion: @escaping (Bool) -> Void) { self.completion = completion }
  private func finish(_ saved: Bool) {
    let callback = completion
    completion = nil
    callback?(saved)
  }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish(!urls.isEmpty) }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(false) }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish(false) }
}
