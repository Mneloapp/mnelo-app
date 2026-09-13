"""Pure configuration guards; no SSH or real service mutation."""
import importlib.util
import pathlib
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[2] / 'deploy/hetzner/enable-delivery.py'
spec = importlib.util.spec_from_file_location('mnelo_delivery_enable', SOURCE)
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)


class DeliveryEnableGuards(unittest.TestCase):
    def test_inserts_scoped_route_without_changing_existing_services(self):
        original = 'mnelo.com {\n respond "existing website"\n}\n' + operator.ANCHOR + '\t@phone {\n\t\tpath /challenge /execute\n\t}\n}\n'
        updated = operator.configure(original)
        self.assertEqual(updated.replace(operator.ROUTE, '', 1), original)
        self.assertIn('max_size 250000', updated)
        self.assertIn('header_up X-Mnelo-Client-IP {http.request.remote.host}', updated)
        self.assertEqual(operator.configure(updated), updated)

    def test_unknown_or_ambiguous_host_is_rejected(self):
        for text in ['', 'different.mnelo.com {}', operator.ANCHOR * 2]:
            with self.assertRaisesRegex(RuntimeError, 'SHAPE_UNKNOWN'):
                operator.configure(text)

    def test_existing_unrecognized_delivery_configuration_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'CONFLICT'):
            operator.configure(operator.ANCHOR + '\trespond /delivery 200\n}\n')


if __name__ == '__main__':
    unittest.main()
