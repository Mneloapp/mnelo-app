"""Operator-only TURN checks using ephemeral .local/turn-qa.json credentials.

Never sends SMS, registers users, transmits chat history or prints credentials.
Denied destinations receive no data. Pair tests send only a constant synthetic
payload between two allocations on our own relay, over UDP and TCP clients.
"""
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import socket
import struct

COOKIE = 0x2112A442
path = Path('.local/turn-qa.json')
if path.stat().st_mode & 0o077:
    raise SystemExit('QA_CREDENTIAL_PERMISSIONS_INVALID')
config = json.loads(path.read_text())
server = config['iceServers'][0]
host = 'relay-dev.mnelo.com'


def attr(kind, value):
    return struct.pack('!HH', kind, len(value)) + value + b'\0' * (-len(value) % 4)


def packet(kind, body, key=None):
    tx = os.urandom(12)
    header = struct.pack('!HHI', kind, len(body) + (24 if key else 0), COOKIE) + tx
    raw = header + body
    if key:
        raw += attr(8, hmac.new(key, raw, hashlib.sha1).digest())
    return tx, raw


def read_exact(sock, count):
    result = b''
    while len(result) < count:
        chunk = sock.recv(count - len(result))
        if not chunk:
            raise RuntimeError('TURN_TCP_CLOSED')
        result += chunk
    return result


def request(sock, tcp, kind, body, key=None):
    tx, raw = packet(kind, body, key)
    sock.sendall(raw)
    if tcp:
        header = read_exact(sock, 20)
        response = header + read_exact(sock, struct.unpack('!H', header[2:4])[0])
    else:
        response = sock.recv(8192)
    assert response[8:20] == tx, 'TURN_TRANSACTION_MISMATCH'
    fields = {}
    offset = 20
    while offset < len(response):
        typ, size = struct.unpack('!HH', response[offset:offset + 4])
        fields[typ] = response[offset + 4:offset + 4 + size]
        offset += 4 + size + (-size % 4)
    error = fields.get(9)
    code = error[2] * 100 + error[3] if error else 0
    return code, fields


def run(tcp, invalid=False):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM if tcp else socket.SOCK_DGRAM)
    sock.settimeout(8)
    sock.connect((host, 3478))
    try:
        transport = attr(0x19, b'\x11\0\0\0')
        code, challenge = request(sock, tcp, 3, transport)
        assert code == 401, 'UNAUTHENTICATED_ALLOCATION_ACCEPTED'
        realm, nonce = challenge[0x14], challenge[0x15]
        password = 'invalid-qa-password' if invalid else server['credential']
        user = server['username'].encode()
        key = hashlib.md5(user + b':' + realm + b':' + password.encode()).digest()
        auth = attr(6, user) + attr(0x14, realm) + attr(0x15, nonce)
        code, allocated = request(sock, tcp, 3, transport + auth, key)
        if invalid:
            assert code in (401, 441), 'WRONG_CREDENTIAL_ACCEPTED'
            print('PASS invalid TURN credential denied over ' + ('TCP' if tcp else 'UDP'))
            return
        assert code == 0 and 0x16 in allocated, 'AUTHENTICATED_ALLOCATION_FAILED'
        address = allocated[0x16]
        relay_port = struct.unpack('!H', address[2:4])[0] ^ (COOKIE >> 16)
        relay_ip = str(ipaddress.ip_address(bytes(a ^ b for a, b in zip(address[4:8], struct.pack('!I', COOKIE)))))
        assert relay_ip == '46.225.169.127' and 49160 <= relay_port <= 49759
        for candidate in ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '1.1.1.1']:
            xor_ip = bytes(a ^ b for a, b in zip(ipaddress.ip_address(candidate).packed, struct.pack('!I', COOKIE)))
            peer = b'\0\x01' + struct.pack('!H', 50000 ^ (COOKIE >> 16)) + xor_ip
            code, _ = request(sock, tcp, 8, attr(0x12, peer) + auth, key)
            assert code == 403, 'FORBIDDEN_PEER_ACCEPTED'
        code, _ = request(sock, tcp, 4, attr(0x0d, struct.pack('!I', 0)) + auth, key)
        assert code == 0, 'ALLOCATION_CLEANUP_FAILED'
        print('PASS authenticated allocation, five denied peer ranges, cleanup over ' + ('TCP' if tcp else 'UDP'))
    finally:
        sock.close()


def pair(tcp):
    allocations = []
    try:
        for _ in range(2):
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM if tcp else socket.SOCK_DGRAM)
            sock.settimeout(8)
            sock.connect((host, 3478))
            transport = attr(0x19, b'\x11\0\0\0')
            code, challenge = request(sock, tcp, 3, transport)
            assert code == 401, 'TURN_CHALLENGE_REQUIRED'
            realm, nonce = challenge[0x14], challenge[0x15]
            user = server['username'].encode()
            key = hashlib.md5(user + b':' + realm + b':' + server['credential'].encode()).digest()
            auth = attr(6, user) + attr(0x14, realm) + attr(0x15, nonce)
            code, fields = request(sock, tcp, 3, transport + auth, key)
            assert code == 0 and 0x16 in fields, 'TURN_PAIR_ALLOCATION_FAILED'
            allocations.append((sock, key, auth, fields[0x16]))
        for source, destination in [(allocations[0], allocations[1]), (allocations[1], allocations[0])]:
            code, _ = request(source[0], tcp, 8, attr(0x12, destination[3]) + source[2], source[1])
            assert code == 0, 'TURN_PAIR_PERMISSION_FAILED'
        # RFC 8656 section 11: Send/Data indications use the authenticated
        # allocation; no long-term MESSAGE-INTEGRITY attribute on indications.
        payload = b'MNELO_SYNTHETIC_RELAY_PAIR_CHECK'
        for source, destination in [(allocations[0], allocations[1]), (allocations[1], allocations[0])]:
            _, encoded = packet(0x16, attr(0x12, destination[3]) + attr(0x13, payload))
            source[0].sendall(encoded)
            if tcp:
                header = read_exact(destination[0], 20)
                response = header + read_exact(destination[0], struct.unpack('!H', header[2:4])[0])
            else:
                response = destination[0].recv(8192)
            assert struct.unpack('!H', response[:2])[0] == 0x17, 'TURN_DATA_INDICATION_REQUIRED'
            fields, offset = {}, 20
            while offset < len(response):
                typ, size = struct.unpack('!HH', response[offset:offset+4])
                fields[typ] = response[offset+4:offset+4+size]
                offset += 4 + size + (-size % 4)
            assert fields.get(0x13) == payload and fields.get(0x12) == source[3], 'TURN_PAIR_DATA_INVALID'
        print('PASS bidirectional own-relay data over ' + ('TCP' if tcp else 'UDP'))
    finally:
        for sock, key, auth, _ in allocations:
            try:
                request(sock, tcp, 4, attr(0x0d, struct.pack('!I', 0)) + auth, key)
            finally:
                sock.close()


if __name__ == '__main__':
    for tcp in (False, True):
        run(tcp, invalid=True)
        run(tcp)
        pair(tcp)
    print('TURN_NETWORK_CHECK_COMPLETE')
