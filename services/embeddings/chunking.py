"""Lossless Unicode splitting using the same pinned tokenizer as inference."""
def split_for_tokenizer(text, encode, limit):
    result = []
    while text:
        end = len(text)
        # Do not assume token-count monotonicity (BPE merges can change it).
        # Every accepted slice is measured independently; halving guarantees progress.
        while len(encode(text[:end])) > limit:
            if end == 1:
                raise ValueError('A character exceeds the token limit')
            end = max(1, end // 2)
        result.append(text[:end])
        text = text[end:]
    return result
