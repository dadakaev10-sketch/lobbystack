import unittest
from chunking import split_for_tokenizer

class ChunkingTests(unittest.TestCase):
    def test_preserves_unicode_and_enforces_actual_token_limit(self):
        # A deliberately non-character tokenizer: each UTF-8 byte is a token.
        encode = lambda text: list(text.encode('utf-8'))
        text = 'Ä中文🙂abc' * 130
        chunks = split_for_tokenizer(text, encode, 512)
        self.assertEqual(''.join(chunks), text)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(0 < len(encode(c)) <= 512 for c in chunks))
    def test_short_input_is_unchanged(self):
        self.assertEqual(split_for_tokenizer('hello', list, 512), ['hello'])
    def test_impossible_single_character_fails_closed(self):
        with self.assertRaises(ValueError):
            split_for_tokenizer('x', lambda _: [0] * 513, 512)

if __name__ == '__main__': unittest.main()
