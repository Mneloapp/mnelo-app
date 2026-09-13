# TestFlight review preparation

The beta description and private reviewer sign-in instructions have been saved in App Store Connect. Build 5 is submitted and Waiting for Review, with Automatically notify testers enabled. Approval and external invitation delivery are not yet confirmed. The owner requested a private invitation for the second tester; their email remains out of source control. Use the account holder's existing contact details in App Store Connect, not invented support addresses.

## Beta description

Mnelo is an invitation-only messenger beta for testing direct and group chats, attachments, voice messages, and voice/video calls. Navigation is Chats, Calls, and Me. Conversation history stays on participant devices; each participant manages their own copy. Registration uses SMS verification. Services handle phone identity, connection signaling and generic notification routing. This development beta is limited to prearranged test numbers and has not undergone an independent security audit. Please contact the developer before enrolling.

## What to test

Install over the existing Mnelo app without deleting it. Confirm registration and local history remain available. On both iPhones, enable notifications in Me, add each other's registered phone number, and compare the peer identity codes. Test two-way messages, attachments, voice messages and voice/video calls on Wi-Fi and cellular. Test background and locked-screen alerts, incoming call accept/decline, and reconnect. Distinguish normal background operation from OS force-quit restrictions. Do not use this beta for sensitive communications pending independent security review.

## Historical build 4 review access gate

Sign-in is required. There is no shared password or fixed OTP in the hosted service. Current admission is exactly the two owner-approved tester numbers, and it was not broadened. Apple requires review sign-in information for the first external beta. A dedicated review enrollment flow must be arranged before submitting a review; do not supply either tester's real SMS code/account as a shared reviewer login, invent credentials, or mark sign-in as unnecessary.

The Test Information form was prepared but could not be saved after accurately checking Sign-in required: User Name and Password became required. The draft above is preserved here. Mnelo Development now has build 4 and the existing account holder, automatic distribution disabled. Its invitation was delivered and the owner confirms the app opened. Mnelo Preview has the owner-provided second tester, zero builds and No Builds Available; its Add Build flow selected build 4 and stopped at required sign-in fields. No external review/invitation delivery is claimed. Do not grant team access merely to bypass review.

## Authorized next step — isolated reviewer accounts

The owner explicitly authorized separate reviewer accounts that can communicate only with one another, with no access to the two real tester accounts. Their implementation, local QA and hosted deployment now pass. Build 5 signed archive/export/upload and Apple processing passed. Both groups now include build 5; external status is Waiting for Review. Automatically notify testers was enabled on submission. Actual access keys and instructions were saved only in Apple's private review information; none are included here. See [review access and operating boundary](APPLE_REVIEW_ACCESS.md). The loopback-only fictional-code fixture remains private. Real tester enrollment, keys, history and SMS admission must remain unchanged. After deployment, use the owner-private instruction file for Apple's actual sign-in fields; no credentials belong in this document.

Apple's [external testing workflow](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers) requires the first external build review. Its [review guidelines](https://developer.apple.com/app-store/review/guidelines/) require usable reviewer access; an alternative full demo mode for security obligations needs prior Apple approval. Do not claim sign-in is unnecessary or that an unimplemented substitute mode exists.
