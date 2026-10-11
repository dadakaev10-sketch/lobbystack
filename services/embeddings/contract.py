"""Dependency-free request contract; no model or credentials in tests."""
import hmac

MODEL_ALIAS = 'gte-local'
MAX_BATCH = 8
MAX_BODY = 65536
MAX_TEXT = 16000
MAX_TOKENS = 512


def authorized(header, secret):
    return bool(secret and header and hmac.compare_digest(header.encode(), ('Bearer ' + secret).encode()))


def validate_payload(data):
    if not isinstance(data, dict) or data.get('model') != MODEL_ALIAS:
        raise ValueError('Invalid model')
    if data.get('encoding_format', 'float') != 'float' or data.get('dimensions', 1536) != 1536:
        raise ValueError('Invalid encoding or dimensions')
    values = data.get('input')
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, list) or not 1 <= len(values) <= MAX_BATCH:
        raise ValueError('Invalid batch')
    if any(not isinstance(x, str) or not x.strip() or len(x) > MAX_TEXT for x in values):
        raise ValueError('Invalid text')
    return values
