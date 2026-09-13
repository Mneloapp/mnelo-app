# UI typography assets

Native mobile UI now uses the **iOS/Android system font**, including system Georgian fallback, with regular body text and restrained medium headings. Web Latin UI remains **DM Sans**; web Georgian UI remains **FiraGO**. Original static Regular, Medium and SemiBold files are bundled; no runtime font service or remote request. The approved Mnelo outlined wordmark is independent and unchanged.

Sources are pinned to immutable upstream revisions; file sizes and SHA-256 hashes are in [ui-fonts.json](audits/ui-fonts.json).

- [DM Sans source](https://github.com/googlefonts/dm-fonts/tree/4412393b7d2de9fe7a92064c2dce9b5af5d7fd26/Sans) — SIL OFL 1.1.
- [FiraGO source](https://github.com/bBoxType/FiraGO/tree/5bbcb9d066ab563686ed1de1e6f62eec0148e82d) — SIL OFL 1.1.

Unmodified upstream license texts accompany the fonts. Font files were not converted, subsetted, renamed internally or generated. Web English uses lighter headings with less compressed tracking. Web Georgian medium UI labels use the regular face for optical balance; emphasized semibold remains available. No font-related native dependency or SDK upgrade.
