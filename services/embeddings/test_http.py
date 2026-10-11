"""Real-model HTTP acceptance tests. Run inside running probe container."""
import json
import math
import os
import unittest
import urllib.request
import urllib.error

class HttpTests(unittest.TestCase):
    def call(self, payload, auth=True):
        headers = {'Content-Type':'application/json'}
        if auth: headers['Authorization'] = 'Bearer ' + os.environ['EMBEDDING_BEARER_SECRET']
        req = urllib.request.Request('http://127.0.0.1:8080/v1/embeddings',data=json.dumps(payload).encode(),headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=120) as r: return r.status,json.load(r)
        except urllib.error.HTTPError as e: return e.code,json.load(e)
    def test_auth(self):
        self.assertEqual(self.call({'model':'gte-local','input':'Hallo'},False)[0],401)
    def test_real_vector(self):
        status,data = self.call({'model':'gte-local','input':'Hallo Welt'})
        self.assertEqual(status,200)
        v=data['data'][0]['embedding']
        self.assertEqual(len(v),1536)
        self.assertTrue(all(math.isfinite(x) for x in v))
        self.assertAlmostEqual(sum(x*x for x in v),1,places=5)
        self.assertGreater(data['usage']['total_tokens'],0)
    def test_no_silent_truncation(self):
        self.assertEqual(self.call({'model':'gte-local','input':'Hallo '*1000})[0],413)
    def test_slow_body_is_bounded(self):
        import socket
        s = socket.create_connection(('127.0.0.1',8080),timeout=8)
        try:
            headers = ('POST /v1/embeddings HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 200\r\nAuthorization: Bearer '+os.environ['EMBEDDING_BEARER_SECRET']+'\r\n\r\n{').encode()
            s.sendall(headers)
            import time
            time.sleep(0.1)
            self.assertEqual(self.call({'model':'gte-local','input':'Hallo'})[0],429)
            response=s.recv(4096)
            self.assertIn(b'408',response.split(b'\r\n')[0])
        finally:
            s.close()

    def test_wrong_model(self):
        self.assertEqual(self.call({'model':'wrong','input':'Hallo'})[0],400)

if __name__=='__main__': unittest.main()
