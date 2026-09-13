import { enrollmentAllowsAccess } from '@/messenger/enrollment';
const identity = { key: 'a'.repeat(64) };
const receipt = {
  phone: '+12025550101',
  service: 'https://identity.example.test',
  testOnly: false,
  verifiedAt: 1,
};
test('a local identity alone never unlocks the application', () => {
  expect(enrollmentAllowsAccess(identity, null, receipt.service, 'production')).toBe(false);
  expect(enrollmentAllowsAccess(null, receipt, receipt.service, 'production')).toBe(false);
});
test('verified devices reopen without a network request or SMS, even long after enrollment', () => {
  expect(enrollmentAllowsAccess(identity, receipt, receipt.service, 'production')).toBe(true);
});
test('a fixture or different service cannot unlock a production application', () => {
  expect(
    enrollmentAllowsAccess(identity, { ...receipt, testOnly: true }, receipt.service, 'production'),
  ).toBe(false);
  expect(
    enrollmentAllowsAccess(identity, { ...receipt, testOnly: true }, receipt.service, 'preview'),
  ).toBe(false);
  expect(
    enrollmentAllowsAccess(identity, receipt, 'https://other.example.test', 'production'),
  ).toBe(false);
  expect(enrollmentAllowsAccess(identity, receipt, undefined, 'production')).toBe(false);
  expect(enrollmentAllowsAccess(identity, receipt, 'invalid', 'production')).toBe(false);
  expect(
    enrollmentAllowsAccess(identity, { ...receipt, testOnly: true }, receipt.service, 'local'),
  ).toBe(true);
});
test('review enrollment is limited to reserved numbers on the exact preview identity service', () => {
  const review = {
    ...receipt,
    testOnly: true,
    phone: '+12025550198',
    service: 'https://identity-dev.mnelo.com',
  };
  expect(enrollmentAllowsAccess(identity, review, review.service, 'preview')).toBe(true);
  for (const environment of ['development', 'production'])
    expect(enrollmentAllowsAccess(identity, review, review.service, environment)).toBe(false);
  expect(
    enrollmentAllowsAccess(
      identity,
      { ...review, phone: receipt.phone },
      review.service,
      'preview',
    ),
  ).toBe(false);
  expect(enrollmentAllowsAccess(identity, review, receipt.service, 'preview')).toBe(false);
});
