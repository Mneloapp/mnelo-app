# Mnelo visual system

## Authority and source

The owner asked on 2026-09-09 to refine the design before physical-device testing, using the ChatGPT conversation “ღამის კლუბის ტევადობა” (private design discussion; link omitted).

The retrieved conversation contains the owner's explicit choices: **Acid Lime**, followed by approval of the **Light** icon and the leaf-like mark after the wordmark. Its subsequent “MNELO — Approved Visual Design System Implementation Brief” specifies the visual system below. These decisions replace the earlier dark-green visual direction. Historical phase reports retain their original descriptions.

Mnelo remains the brand. The owner subsequently changed the product to a device-owned messenger with **Chats | Calls | Me** and authorized native identifier `com.mnelo.messenger` on September 11. The visual rules remain in effect; older Connect-specific screens and interaction descriptions below are historical and do not restore the removed feature. See [current identity](PRODUCT_IDENTITY.md).

## Visual rules

- Warm off-white pages, white or soft neutral surfaces, graphite/black type, generous whitespace.
- Acid Lime is a small signal for connection actions, an active tab indicator, unread counts and selected connection moments. It is not a page background or a destructive-action color.
- Chats uses rows and subtle dividers. No feed, stories, recommendations or advertising.
- Connect keeps one prominent request field, Need/Offer, Connect me and restrained examples. No category grid or invented percentages.
- Incoming messages use soft neutral bubbles; outgoing messages use a very pale lime tint. Private content, delivery state and media retain their existing service behavior.
- Results and requests use lime for Connect, Send request and Accept; View and ordinary Decline stay neutral. Reasons, ratings and verification must come from actual data.
- Me uses grouped rows. Privacy stays neutral. Destructive controls use semantic red.
- Calls alone use a near-black surface, neutral circular controls and red hang-up. No application-wide dark theme is introduced.

## Tokens and accessibility

Canonical tokens are centralized in `src/theme/tokens.ts`.

| Role                            | Value / treatment |
| ------------------------------- | ----------------- |
| Brand signal                    | `#D7FF3F`         |
| Page                            | `#FAFAF7`         |
| Surface                         | `#FFFFFF`         |
| Soft surface                    | `#F3F4F1`         |
| Primary text                    | `#1A1A1A`         |
| Strong black                    | `#111111`         |
| Canonical secondary gray        | `#6B7280`         |
| Secondary text on soft surfaces | `#626974`         |
| Subtle divider                  | `#E5E7EB`         |
| Accessible control border       | `#83877E`         |
| Outgoing message tint           | `#F0F6DB`         |

Dark text on lime is mandatory. The initial contrast check found that canonical gray on soft neutral / pale lime was only **4.379:1 / 4.353:1**. Secondary body copy therefore uses `#626974`, which measures **5.016:1 / 4.987:1** on those surfaces. The canonical gray remains suitable for placeholders on white and inactive labels on the warm page. Focus outlines use a high-contrast dark outline; the call surface uses a light focus outline. Color is accompanied by labels, checked state or selected-tab accessibility state.

Semantic typography includes display, titleLarge, title, headline, body, bodyMedium, button, label, caption and micro. Spacing uses 4/8/12/16/20/24/32/40/48/64 steps. Controls retain at least 48-point touch targets and scalable labels. Tab height accounts for icons, safe area, font scale and two-line labels when text is enlarged.

A live iOS Dynamic Type change initially enlarged glyphs while retaining old line-box measurements. Remounting only the native Text/TextInput primitives when `fontScale` changes corrected the reproduced clipping without remounting feature screens or disabling scaling. Input values remain controlled by their existing feature state.

## Fonts and icons

New-chat and new-call composers use native modal presentation with a centered title, close control and nested back navigation. The shared contact picker uses a soft search field, restrained action rows and alphabetical local contacts. Voice/video icons sit beside contacts in the call picker; the keypad is a separate screen with round number controls. All dimensions/colors/fonts come from the existing tokens; the keypad grows vertically for larger text. Identity-code fields no longer occupy the main contact picker. No WhatsApp artwork, logos or green palette is used. The interaction reference is documented in [UX_FLOW](UX_FLOW.md).

September 11 tab refinement: primary page headers use localized Chats / Calls / Me labels in the approved text faces below. The custom Mnelo wordmark is not substituted for a page title. All headers reserve the same minimum action-row height; header controls use a dedicated unpadded style, not the bordered list-row style. Page safe-area padding and tab padding use the same inset hook, following [React Navigation's safe-area guidance](https://reactnavigation.org/docs/handling-safe-area/). Inactive native tab content retains its measured layout and accessibility exclusion; web content is additionally hidden from keyboard traversal. The three light local tabs are prepared together, with no page-slide animation.

Native mobile UI uses the iOS/Android system font with regular/medium weights. Web Latin UI uses **DM Sans**; web Georgian uses **FiraGO**, with lighter optical weights. See [TYPOGRAPHY](TYPOGRAPHY.md) for exact sources and licenses. Both load the regular, medium and semibold faces from local packaged files. The Mnelo wordmark is a bundled outlined asset and remains unchanged when the UI language changes. Feather is the single ordinary control-icon family; it is separate from the Mnelo brand symbol.

The earlier Inter/Noto npm dependencies remain installed but are no longer loaded. The current six TTF files are bundled directly under `assets/fonts`; `@expo/vector-icons@15.1.1` and `expo-font@57.0.4` load them. No native SDK upgrade or generated-code patch was required.

`TypographyProvider` loads only the six used font faces and Feather through Expo Font. Explicit local assets include only the used weights. No remote font CDN or runtime font download URL is used in release bundles. A font load error reaches the existing retry boundary with `FONT_LOAD_FAILED`; it is not silently reported as successful typography initialization.

Implementation references: [Expo Font](https://docs.expo.dev/versions/latest/sdk/font/), [Expo Google Fonts](https://github.com/expo/google-fonts), and [Expo icons](https://docs.expo.dev/guides/icons/). License texts are retained under [licenses](licenses/README.md).

## Approved brand assets

The full reference images and final brief are now available and were reviewed through section 102. [Source provenance and superseded render details](design/references/README.md).

The selected Light icon has a black lower-left semicircle and upper-right lime leaf sharing a vertical seam. The rounded black Mnelo wordmark carries the same small leaf. `assets/brand/geometry.json` provides the editable path source reconstructed from the approved board; production exports use no reference-image pixels or font-dependent text objects.

Four transparent symbol variants, four outlined wordmarks, the leaf, opaque Light/dark launcher icons, Android adaptive/monochrome layers and a notification silhouette are generated from this source and the central color tokens. The app uses the Light icon, a restrained warm-white splash and shared `MneloLogo` / `MneloMark` components on launch/welcome/header surfaces. The dark export is prepared, not configured as an additional app theme. [Asset inventory and generation](../assets/README.md).

`npm run check:brand` verifies vector safety, PNG hashes/dimensions, opaque 1024px launcher exports and adaptive-layer safe-circle containment. Sharp is a development-only export dependency. No runtime native module or Expo SDK change is needed for the brand assets.

## Review matrix

Compilation alone is not visual approval. See [design QA](DESIGN_QA.md) for actual observations and gaps.

The final visual pass must cover welcome/splash/icon; phone/OTP/identity/capability; empty and populated Chats; search/new message/new group; direct/group chat; long and mixed-language messages; delivery/retry/reply/reaction/deletion states; image/file/voice/location/contact messages; composer and keyboard; every Connect/result/profile/request state; call ringing/connected/reject/failure and controls; Me/needs/connections; privacy/notifications/devices/account; offline and error states. Include small and large screens, text enlargement, VoiceOver/TalkBack, safe areas and reduced motion. Do not add nonexistent product states or claim physical-device acceptance from a simulator.

## Scope boundary

This pass changes presentation, bundled typography and native identity artwork only. Repository contracts, database migrations, RLS, auth/session storage, request permissions, matching facts, call authorization, deep-link input handling and native identities retain their existing behavior. Physical iPhone QA is deferred at the owner's request until the design has been refined.

## September 12 typography and tab refinement

The complete active tab (icon and label) has one lime rounded background. Inactive tabs remain unfilled. Notification counts use a dark badge with white digits so they remain distinct from the selected tab. The default content calculation is 58 points plus the bottom safe inset and 1-point divider, down from 68 plus inset/divider. Three persistent routes keep `animation: none` and `lazy: false`.

Navigation labels and page titles scale up to 2× to retain access to content at the largest OS settings; ordinary screen content keeps full scaling. Tab labels can occupy two lines. The development-only environment notice scales up to 1.5× to avoid covering the screen. Home-indicator inset is preserved. There is no font scaling restriction on messages or editable fields.
