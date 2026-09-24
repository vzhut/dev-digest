import { isIP } from 'node:net';

const v4ToInt = (ip: string): number =>
  ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);

const inV4 = (n: number, base: string, bits: number): boolean => {
  const size = 2 ** (32 - bits);
  const start = v4ToInt(base);
  return n >= start && n < start + size;
};

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3], // multicast + reserved + broadcast
];

/** True for loopback / private / link-local / metadata / reserved addresses (v4 + v6). Unparseable input counts as private. */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const n = v4ToInt(address);
    return PRIVATE_V4.some(([base, bits]) => inV4(n, base, bits));
  }
  if (kind === 6) {
    const a = address.toLowerCase();
    // IPv4-mapped / -compatible (::ffff:1.2.3.4, ::ffff:7f00:1) → judge the embedded v4.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateAddress(mapped[1]!);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(a.split(':')[0] || '0', 16);
    if ((first & 0xff00) === 0) return true; // ::/8 — unspecified, loopback, deprecated IPv4-compatible (::7f00:1)
    if (first === 0x2002) return true; // 6to4 — embeds an IPv4 address that could be private
    if (/^2001:0{0,4}:/.test(a) || /^2001:0*db8:/.test(a)) return true; // Teredo, documentation range
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (a.startsWith('64:ff9b:')) return true; // NAT64 — could embed a private v4
    return false;
  }
  return true;
}
