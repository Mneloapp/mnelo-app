import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { LaunchScreen } from '@/components/LaunchScreen';
import { AppButton } from '@/components/AppButton';
import { i18n } from '@/i18n';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

it('renders the accessible native launch screen in English without services', async () => {
  await render(
    <I18nextProvider i18n={i18n}>
      <LaunchScreen />
    </I18nextProvider>,
  );
  expect(screen.getByRole('header', { name: 'Mnelo' })).toBeOnTheScreen();
  expect(screen.getByText('Your conversations. Your devices.')).toBeOnTheScreen();
});

it('supports the Georgian dictionary', async () => {
  await i18n.changeLanguage('ka');
  await render(
    <I18nextProvider i18n={i18n}>
      <LaunchScreen />
    </I18nextProvider>,
  );
  expect(screen.getByText('შენი საუბრები. შენი მოწყობილობები.')).toBeOnTheScreen();
});

it('exposes an actionable screen-reader-labelled recovery button', async () => {
  const retry = jest.fn();
  await render(<AppButton label="Try again" onPress={retry} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
