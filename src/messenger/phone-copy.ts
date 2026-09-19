export const phoneEn = {
  cardCall: 'Call',
  cardSaved: 'Saved',
  contactNames: 'Allow access to contacts',
  saveToPhone: 'Save to phone Contacts',
  savedToPhone: 'Saved in Contacts',
  blockedSharedContact: 'Unblock this person in Me → Blocked contacts before calling or messaging.',
  saveToPhoneHint: 'Save this person in your phone Contacts and Mnelo.',
  contactsPermissionRequired: 'Allow Contacts access to save this person on your phone.',
  contactsUnavailable: 'Phone Contacts are available in the mobile app.',
  selectContacts: 'Choose contacts for Mnelo',
  openContactsSettings: 'Allow access to contacts',
  refreshContactNames: 'Refresh contact names',
  limitedContactsHint:
    'Only selected contacts are shared with Mnelo. Include this person to use the name saved on your phone.',
  contactNamesHint: 'Show people as you saved them in Contacts. Names stay on this phone.',
  title: 'Phone number',
  welcome: 'What’s your number?',
  enrollmentHint:
    'Verify your mobile number to start using Mnelo. You can set your username and optional name in Me afterwards.',
  changeNumber: 'Change phone number',
  changeHint:
    'Verify your new number. Your current number stays active until verification succeeds. Your conversations stay on this device.',
  currentNumber: 'Current number: {{phone}}',
  dial: 'Dial a number',
  dialHint:
    'Enter a full number to call someone on Mnelo. Calls use the internet, not your mobile minutes.',
  findToCall: 'Find on Mnelo',
  continueCall: 'Continue to call',
  intro:
    'Register your number so people who know it can find you. Your conversations and private keys stay on participant devices.',
  input: 'Mobile number with country code',
  nationalInput: 'Mobile number',
  nationalHint: 'Enter your number without the country code.',
  nationalInvalid: 'Enter a valid mobile number for the selected country.',
  send: 'Send verification code',
  code: '6-digit SMS code',
  verify: 'Verify number',
  sent: 'Enter the code sent to {{phone}}.',
  reviewKey: 'Review access key',
  reviewInstructions:
    'Isolated Apple review account. No SMS is sent. Paste the access key provided in App Store Connect. This account can contact only the other review account.',
  reviewSignIn: 'Open review account',
  reviewRetry: 'Start another sign-in attempt',
  reviewNotice: 'Apple review account · isolated from real testers',
  resend: 'Resend code',
  resendIn: 'Resend in {{seconds}}s',
  expires: 'This code has expired. Request another one.',
  change: 'Use another number',
  registered: 'Your number is verified',
  discoverable: 'Let people find me by my number',
  discoveryDefault:
    'Your phone number is the main way people find you on Mnelo. Number search is enabled when you register. You can turn it off in Me → Privacy.',
  disclosure:
    'Registration stores a minimal number-to-public-ID record. The SMS provider receives your number. Contact names and your address book are not uploaded.',
  unlink: 'Unlink my number',
  unlinkConfirm:
    'Remove my number from registration and search. Keep local history, but require verification before entering Mnelo again.',
  unavailable: 'The phone service is unavailable. Please try again later.',
  fixture: 'Development test only. No SMS sent. See the local setup guide for the code.',
  search: 'Find by phone number',
  searchHint:
    'Enter the complete number of someone you know. Only numbers with discovery enabled appear.',
  find: 'Find person',
  noResult: 'No discoverable person was found for this number.',
  found: 'On Mnelo',
  name: 'Save contact as',
  startChat: 'Message',
  details: 'Contact details & security',
  hideDetails: 'Hide details',
  profileAfterConnect:
    'Their shared profile appears when you connect. You can save your own contact name in Details.',
  mutualContact:
    'They can accept your request in Chats. Keep both apps open for the first connection.',
  identityChanged:
    'This number no longer matches the saved contact. The existing contact and conversations were kept. Compare codes with the person before changing anything.',
  verifyIdentity:
    'Number search uses the registration directory to save this contact’s key on your phone. It is not an independent identity check. For stronger verification, compare this code directly with the person. A saved key will never be silently replaced.',
  identityConfirmed: 'I compared and confirmed this person’s Mnelo code',
  registeredRequired: 'Verify your own number before using number search.',
  invalid: 'Enter a valid mobile number including its country code, such as +995.',
  invalidCode: 'The code is incorrect. Try again.',
  limited: 'Too many attempts. Please wait before trying again.',
  recovery:
    'This number is linked to another device identity. Restore your own backup and key, or unlink the number from your old device. SMS cannot replace that identity or recover your history.',
  failed: 'Phone service could not complete this action. Please try again.',
  fixtureOnly: 'This local service accepts only the fictional test numbers in the setup guide.',
  permission: 'Number search is unavailable until you verify your own number.',
  own: 'This is your own Mnelo identity.',
  afterName:
    'Your private identity is created on this device. Next, verify your mobile number to make it easier for people to find you.',
} as const;
export const phoneKa: Record<keyof typeof phoneEn, string> = {
  cardCall: 'დარეკვა',
  cardSaved: 'შენახულია',
  contactNames: 'კონტაქტებზე წვდომის დაშვება',
  saveToPhone: 'ტელეფონის კონტაქტებში შენახვა',
  savedToPhone: 'კონტაქტებში შენახულია',
  blockedSharedContact: 'დარეკვის ან მიწერის წინ მოხსენი ბლოკი Me → დაბლოკილი კონტაქტებიდან.',
  saveToPhoneHint: 'შეინახე ეს ადამიანი ტელეფონის კონტაქტებსა და Mnelo-ში.',
  contactsPermissionRequired: 'ტელეფონში შესანახად დაუშვი კონტაქტებზე წვდომა.',
  contactsUnavailable: 'ტელეფონის კონტაქტები ხელმისაწვდომია მობილურ აპში.',
  selectContacts: 'კონტაქტების არჩევა Mnelo-სთვის',
  openContactsSettings: 'კონტაქტებზე წვდომის დაშვება',
  refreshContactNames: 'კონტაქტების სახელების განახლება',
  limitedContactsHint:
    'Mnelo მხოლოდ არჩეულ კონტაქტებს ხედავს. დაამატე ეს ადამიანიც, რომ ტელეფონში შენახული სახელი გამოჩნდეს.',
  contactNamesHint:
    'ადამიანები გამოჩნდებიან იმ სახელით, როგორც კონტაქტებში გყავს შენახული. სახელები ამ ტელეფონზე რჩება.',
  reviewKey: 'შემმოწმებლის წვდომის გასაღები',
  reviewInstructions:
    'Apple-ის იზოლირებული სატესტო ანგარიში. SMS არ იგზავნება. ჩასვი App Store Connect-ში მოცემული წვდომის გასაღები. ეს ანგარიში მხოლოდ მეორე სატესტო ანგარიშს უკავშირდება.',
  reviewSignIn: 'სატესტო ანგარიშის გახსნა',
  reviewRetry: 'შესვლის ხელახლა დაწყება',
  reviewNotice: 'Apple-ის სატესტო ანგარიში · გამიჯნულია რეალური ტესტერებისგან',
  title: 'მობილურის ნომერი',
  welcome: 'რა არის შენი ნომერი?',
  enrollmentHint:
    'Mnelo-ში შესასვლელად დაადასტურე მობილურის ნომერი. იუზერნეიმს და სურვილისამებრ სახელსა და გვარს შემდეგ, Me-ში მიუთითებ.',
  changeNumber: 'ნომრის შეცვლა',
  changeHint:
    'დაადასტურე ახალი ნომერი. მანამდე ძველი ნომერი აქტიური რჩება. მიმოწერა ამ მოწყობილობაზე შენარჩუნდება.',
  currentNumber: 'მიმდინარე ნომერი: {{phone}}',
  dial: 'ნომრის აკრეფა',
  dialHint:
    'შეიყვანე სრული ნომერი Mnelo-ს მომხმარებელთან დასარეკად. ზარი ინტერნეტით ხდება და მობილურის წუთებს არ იყენებს.',
  findToCall: 'Mnelo-ში პოვნა',
  continueCall: 'დარეკვის გაგრძელება',
  intro:
    'დაადასტურე ნომერი, რათა მისმა მცოდნე ადამიანებმა გიპოვონ. მიმოწერა და პირადი გასაღებები მონაწილეების მოწყობილობებზე რჩება.',
  input: 'მობილურის ნომერი ქვეყნის კოდით',
  nationalInput: 'მობილურის ნომერი',
  nationalHint: 'ჩაწერე ნომერი ქვეყნის კოდის გარეშე.',
  nationalInvalid: 'ჩაწერე არჩეული ქვეყნის შესაბამისი მობილურის ნომერი.',
  send: 'დადასტურების კოდის გაგზავნა',
  code: 'SMS-ის 6-ციფრიანი კოდი',
  verify: 'ნომრის დადასტურება',
  sent: 'შეიყვანე {{phone}} ნომერზე გაგზავნილი კოდი.',
  resend: 'კოდის ხელახლა გაგზავნა',
  resendIn: 'ხელახლა გაგზავნა {{seconds}} წამში',
  expires: 'კოდის ვადა ამოიწურა. მოითხოვე ახალი კოდი.',
  change: 'სხვა ნომრის გამოყენება',
  registered: 'შენი ნომერი დადასტურებულია',
  discoverable: 'ნომრით ჩემი პოვნა დაშვებულია',
  discoveryDefault:
    'მობილურის ნომერი Mnelo-ში შენი პოვნის მთავარი საშუალებაა. რეგისტრაციისას ნომრით პოვნა ჩართულია. მისი გათიშვა Me-ს კონფიდენციალურობის პარამეტრებიდან შეგიძლია.',
  disclosure:
    'რეგისტრაცია ინახავს მხოლოდ ნომრისა და საჯარო ID-ის მინიმალურ კავშირს. SMS პროვაიდერი იღებს შენს ნომერს. კონტაქტების სახელები და სატელეფონო წიგნი არ იტვირთება.',
  unlink: 'ნომრის კავშირის გაუქმება',
  unlinkConfirm:
    'ნომერი წაიშალოს რეგისტრაციიდან და ძებნიდან. მიმოწერა დარჩეს, მაგრამ აპში ხელახლა შესვლისთვის ნომრის დადასტურება დამჭირდეს.',
  unavailable: 'ნომრის სერვისი მიუწვდომელია. გთხოვ, მოგვიანებით სცადე.',
  fixture: 'მხოლოდ სატესტო რეჟიმი. SMS არ გაგზავნილა. კოდი იხილე გაშვების ინსტრუქციაში.',
  search: 'ნომრით პოვნა',
  searchHint:
    'შეიყვანე ნაცნობი ადამიანის სრული ნომერი. გამოჩნდება მხოლოდ ის, ვისაც ნომრით პოვნა ჩართული აქვს.',
  find: 'ადამიანის პოვნა',
  noResult: 'ამ ნომრით მოსაძებნი ადამიანი ვერ მოიძებნა.',
  found: 'აქვს Mnelo',
  name: 'კონტაქტის შესანახი სახელი',
  startChat: 'მიმოწერა',
  details: 'კონტაქტის დეტალები და უსაფრთხოება',
  hideDetails: 'დეტალების დამალვა',
  profileAfterConnect:
    'გაზიარებული პროფილი დაკავშირებისას გამოჩნდება. საკუთარი სახელი დეტალებში შეგიძლია შეინახო.',
  mutualContact:
    'მოთხოვნას მეორე ადამიანი Chats-ში მიიღებს. პირველი კავშირისას ორივე აპი გახსნილი დატოვეთ.',
  identityChanged:
    'ნომერი შენახულ კონტაქტს აღარ ემთხვევა. არსებული კონტაქტი და მიმოწერა შენარჩუნებულია. ცვლილებამდე ამ ადამიანს კოდი შეადარე.',
  verifyIdentity:
    'ნომრით პოვნა სარეგისტრაციო ცნობარს ეყრდნობა და კონტაქტის გასაღებს შენს ტელეფონში ინახავს. ეს ვინაობის დამოუკიდებელი შემოწმება არ არის. მეტი დაცულობისთვის კოდი უშუალოდ ამ ადამიანს შეადარე. შენახული გასაღები ჩუმად არასოდეს შეიცვლება.',
  identityConfirmed: 'შევადარე და დავადასტურე ამ ადამიანის Mnelo კოდი',
  registeredRequired: 'ნომრით ძებნამდე დაადასტურე საკუთარი ნომერი.',
  invalid: 'შეიყვანე სწორი მობილურის ნომერი ქვეყნის კოდით, მაგალითად +995.',
  invalidCode: 'კოდი არასწორია. სცადე ხელახლა.',
  limited: 'მცდელობების რაოდენობა ამოიწურა. გთხოვ, ცოტა ხანს დაელოდო.',
  recovery:
    'ეს ნომერი სხვა მოწყობილობის ვინაობასთანაა დაკავშირებული. აღადგინე საკუთარი ასლი და გასაღები, ან გააუქმე ნომრის კავშირი ძველი მოწყობილობიდან. SMS ვერ შეცვლის ამ ვინაობას და ვერ აღადგენს მიმოწერას.',
  failed: 'ნომრის სერვისმა მოქმედება ვერ დაასრულა. სცადე ხელახლა.',
  fixtureOnly: 'ადგილობრივი სერვისი მხოლოდ გაშვების ინსტრუქციაში მითითებულ სატესტო ნომრებს იღებს.',
  permission: 'ნომრით ძებნა ხელმისაწვდომი გახდება საკუთარი ნომრის დადასტურების შემდეგ.',
  own: 'ეს შენი საკუთარი Mnelo ვინაობაა.',
  afterName:
    'პირადი ვინაობა ამ მოწყობილობაზე შეიქმნება. შემდეგ დაადასტურებ მობილურის ნომერს, რათა სხვებმა უფრო მარტივად გიპოვონ.',
};
