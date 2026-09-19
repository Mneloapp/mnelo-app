import ExpoModulesCore
import MapKit

public final class MneloLocationModule: Module {
  private weak var picker: MneloPlacePicker?
  public func definition() -> ModuleDefinition {
    Name("MneloLocation")
    AsyncFunction("choose") { (labels: [String: String], promise: Promise) in
      guard self.picker == nil, let parent = self.appContext?.utilities?.currentViewController(),
        parent.viewIfLoaded?.window != nil, UIApplication.shared.applicationState == .active else {
        promise.reject("LOCATION_UNAVAILABLE", "Location picker is unavailable")
        return
      }
      let picker = MneloPlacePicker(labels: labels) { [weak self] result in
        self?.picker = nil
        promise.resolve(result)
      }
      self.picker = picker
      let navigation = UINavigationController(rootViewController: picker)
      navigation.modalPresentationStyle = .fullScreen
      parent.present(navigation, animated: true)
    }.runOnQueue(.main)
  }
}

// Search uses Apple's public Maps service. It never reads the user's current
// location or contacts; a coordinate is returned only after explicit selection.
final class MneloPlacePicker: UIViewController, UISearchBarDelegate, UITableViewDataSource, UITableViewDelegate {
  private let labels: [String: String]
  private var completion: (([String: Double]?) -> Void)?
  private let map = MKMapView()
  private let searchBar = UISearchBar()
  private let results = UITableView()
  private let hint = UILabel()
  private var sendButton: UIBarButtonItem!
  private var search: MKLocalSearch?
  private var matches: [MKMapItem] = []
  private var selected: CLLocationCoordinate2D?
  private var pin: MKPointAnnotation?
  private var resultsHeight: NSLayoutConstraint!
  init(labels: [String: String], completion: @escaping ([String: Double]?) -> Void) {
    self.labels = labels
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override func viewDidLoad() {
    super.viewDidLoad()
    title = labels["title"]
    view.backgroundColor = .systemBackground
    navigationItem.leftBarButtonItem = UIBarButtonItem(title: labels["cancel"], style: .plain, target: self, action: #selector(cancel))
    sendButton = UIBarButtonItem(title: labels["send"], style: .done, target: self, action: #selector(send))
    sendButton.isEnabled = false
    navigationItem.rightBarButtonItem = sendButton
    searchBar.placeholder = labels["search"]
    searchBar.searchBarStyle = .minimal
    searchBar.delegate = self
    searchBar.autocorrectionType = .no
    searchBar.searchTextField.accessibilityLabel = labels["search"]
    map.showsUserLocation = false
    map.isRotateEnabled = false
    map.addGestureRecognizer(UILongPressGestureRecognizer(target: self, action: #selector(dropPin(_:))))
    map.accessibilityLabel = labels["map"]
    hint.text = labels["hint"]
    hint.font = .preferredFont(forTextStyle: .footnote)
    hint.adjustsFontForContentSizeCategory = true
    hint.textColor = .secondaryLabel
    hint.numberOfLines = 0
    hint.textAlignment = .center
    results.dataSource = self
    results.delegate = self
    results.keyboardDismissMode = .onDrag
    results.isHidden = true
    for child in [searchBar, results, map, hint] {
      child.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(child)
    }
    resultsHeight = results.heightAnchor.constraint(equalToConstant: 0)
    NSLayoutConstraint.activate([
      searchBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      searchBar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
      searchBar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
      results.topAnchor.constraint(equalTo: searchBar.bottomAnchor),
      results.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      results.trailingAnchor.constraint(equalTo: view.trailingAnchor), resultsHeight,
      map.topAnchor.constraint(equalTo: results.bottomAnchor),
      map.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      map.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      map.bottomAnchor.constraint(equalTo: hint.topAnchor, constant: -12),
      hint.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      hint.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
      hint.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
    ])
  }
  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if navigationController?.presentingViewController == nil { finish(nil) }
  }
  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let available = view.safeAreaLayoutGuide.layoutFrame.height
    let height = results.isHidden ? 0 : min(220, CGFloat(matches.count) * 62, max(60, available * 0.38))
    if abs(resultsHeight.constant - height) > 0.5 { resultsHeight.constant = height }
  }
  private func finish(_ value: [String: Double]?) {
    guard let completion else { return }
    self.completion = nil
    search?.cancel()
    search = nil
    dismiss(animated: true) { completion(value) }
  }
  @objc private func cancel() { finish(nil) }
  @objc private func send() {
    guard let selected, CLLocationCoordinate2DIsValid(selected) else { return }
    finish(["latitude": selected.latitude, "longitude": selected.longitude])
  }
  @objc private func dropPin(_ gesture: UILongPressGestureRecognizer) {
    guard gesture.state == .began else { return }
    searchBar.resignFirstResponder()
    choose(map.convert(gesture.location(in: map), toCoordinateFrom: map), title: labels["selected"])
  }
  private func choose(_ coordinate: CLLocationCoordinate2D, title: String?) {
    guard CLLocationCoordinate2DIsValid(coordinate) else { return }
    search?.cancel()
    search = nil
    selected = coordinate
    if let pin { map.removeAnnotation(pin) }
    let next = MKPointAnnotation()
    next.coordinate = coordinate
    next.title = title
    pin = next
    map.addAnnotation(next)
    map.selectAnnotation(next, animated: true)
    sendButton.isEnabled = true
    hint.text = title ?? labels["selected"]
    results.isHidden = true
    resultsHeight.constant = 0
  }
  func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
    search?.cancel()
    search = nil
    selected = nil
    sendButton.isEnabled = false
    if let pin { map.removeAnnotation(pin) }
    pin = nil
    hint.text = labels["hint"]
    matches = []
    results.reloadData()
    results.isHidden = true
    resultsHeight.constant = 0
  }
  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    let query = (searchBar.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty, query.count <= 200 else { return }
    search?.cancel()
    searchBar.resignFirstResponder()
    hint.text = labels["searching"]
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    let operation = MKLocalSearch(request: request)
    search = operation
    operation.start { [weak self, weak operation] response, _ in
      DispatchQueue.main.async {
        guard let self, let operation, self.search === operation, self.completion != nil else { return }
        self.search = nil
        self.matches = Array((response?.mapItems ?? []).prefix(10))
        self.results.reloadData()
        self.results.isHidden = self.matches.isEmpty
        self.view.setNeedsLayout()
        self.hint.text = self.matches.isEmpty ? self.labels["noResults"] : self.labels["choose"]
      }
    }
  }
  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { matches.count }
  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
    let item = matches[indexPath.row]
    cell.textLabel?.text = item.name
    cell.detailTextLabel?.text = item.placemark.title
    cell.textLabel?.font = .preferredFont(forTextStyle: .body)
    cell.detailTextLabel?.font = .preferredFont(forTextStyle: .caption1)
    cell.accessoryType = .disclosureIndicator
    return cell
  }
  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    let item = matches[indexPath.row]
    choose(item.placemark.coordinate, title: item.name)
    map.setRegion(MKCoordinateRegion(center: item.placemark.coordinate,
      latitudinalMeters: 1500, longitudinalMeters: 1500), animated: true)
  }
}
