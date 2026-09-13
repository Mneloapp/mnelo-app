# Mnelo application identity

The official identity is the owner's **04 Selected / Light** mark and Mnelo wordmark with a lime leaf. [Reference provenance](../docs/design/references/README.md).

`brand/geometry.json` is the canonical, editable vector source reconstructed from the approved render. It defines the connected lower semicircle, upper leaf and outlined wordmark. The reconstruction is an engineering vectorization of the approved artwork, not an original typeface file from its designer. Production assets contain paths, never cropped reference pixels. UI typography remains Inter / Noto Sans Georgian.

Run `npm run brand:generate` to produce the SVG and optimized PNG pairs, then `npm run check:brand`. Sharp is a development-only export tool; the mobile app uses bundled PNGs and adds no SVG native dependency. Colors come from the central theme. `exports.json` records dimensions, byte counts and SHA-256 hashes.

- `mark-primary`, `mark-dark`, `mark-black`, `mark-white`: transparent symbol variants.
- `wordmark-primary`, `wordmark-dark`, `wordmark-black`, `wordmark-white`: outlined wordmark and the same leaf geometry.
- `leaf`: standalone transparent accent.
- `app-icon`: 1024px opaque warm-white icon; corners are left to the platform.
- `app-icon-dark`: matching opaque dark export, prepared for future platform appearance configuration.
- `android-foreground`, `android-monochrome`: transparent adaptive layers, constrained to Android's central 66/108 safe circle.
- `notification`: white alpha-only silhouette for Android notification masking.

The current application uses the Light launcher icon and a restrained warm-white splash with the primary mark. Dark and monochrome exports do not enable an application-wide dark theme. `MneloBrand.tsx` supplies shared logo/mark components; feature screens must not recreate the geometry. The slogan remains ordinary editable localized copy and is not embedded in the logo.

Keep the symbol's aspect ratio, connected seam and color order. Do not add gradients, shadows, outlines, letters or a baked rounded-square mask. Give the mark clear space; never use lime alone for readable text. The obsolete system-font M and template bitmaps have been removed.
