import unittest
from contract import validate_payload, authorized

class ContractTests(unittest.TestCase):
    def test_empty_inputs_rejected(self):
        with self.assertRaises(ValueError):
            validate_payload({'model': 'gte-local', 'input': []})
    def test_valid_input(self):
        self.assertEqual(validate_payload({'model': 'gte-local', 'input': 'Hallo'}), ['Hallo'])
    def test_auth_fails_closed(self):
        self.assertFalse(authorized(None, ''))
        self.assertFalse(authorized('Bearer wrong', 'secret'))
        self.assertTrue(authorized('Bearer secret', 'secret'))
    def test_bounds_and_model(self):
        for data in [{'model':'wrong','input':'x'}, {'model':'gte-local','input':['x']*9}, {'model':'gte-local','input':'x'*16001}, {'model':'gte-local','input':[2]}, {'model':'gte-local','input':' '}]:
            with self.assertRaises(ValueError):
                validate_payload(data)

if __name__ == '__main__': unittest.main()
