import { i18n } from './index';
// Presentation of the deterministic interpreter's canonical vocabulary only.
// Unknown terms and all user-authored profile/message text remain unchanged.
const terms = {
  'Electrical installation': 'ელექტროსამუშაოები',
  Plumbing: 'სანტექნიკური სამუშაოები',
  Cleaning: 'დასუფთავება',
  'Vehicle repair': 'ავტომობილის შეკეთება',
  'Moving assistance': 'გადაზიდვაში დახმარება',
  'Legal services': 'იურიდიული მომსახურება',
  Accounting: 'ბუღალტერია',
  'Software development': 'პროგრამირება',
  Design: 'დიზაინი',
  Tutoring: 'რეპეტიტორობა',
  Tennis: 'ჩოგბურთი',
  Hiking: 'ლაშქრობა',
  Chess: 'ჭადრაკი',
  Running: 'სირბილი',
  'Language exchange': 'ენების პრაქტიკა',
  Photography: 'ფოტოგრაფია',
  Translation: 'თარგმნა',
  Cooking: 'კულინარია',
  Music: 'მუსიკა',
  Volunteering: 'მოხალისეობა',
  Internship: 'სტაჟირება',
  Collaboration: 'თანამშრომლობა',
  Bicycle: 'ველოსიპედი',
  Laptop: 'ლეპტოპი',
  Furniture: 'ავეჯი',
  Books: 'წიგნები',
} as const;
const areas = {
  Vake: 'ვაკე',
  Saburtalo: 'საბურთალო',
  Gldani: 'გლდანი',
  Didube: 'დიდუბე',
  Tbilisi: 'თბილისი',
  Batumi: 'ბათუმი',
  Kutaisi: 'ქუთაისი',
  Rustavi: 'რუსთავი',
  Online: 'ონლაინ',
} as const;
export function intentTerm(value: string) {
  return i18n.language === 'ka' && Object.hasOwn(terms, value)
    ? terms[value as keyof typeof terms]
    : value;
}
export function intentArea(value: string) {
  return i18n.language === 'ka' && Object.hasOwn(areas, value)
    ? areas[value as keyof typeof areas]
    : value;
}
