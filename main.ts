// Tiny stack VM for make.fun's tiny-stack-vm-01 ISA v1: wrapping signed
// 32-bit values, 256-value stack, 64-deep call stack, 256 words of memory,
// traps 2..11, 1,000,000-step and 65,536-byte output limits.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode tables built once: immediate length, pops and pushes per opcode,
// and -1 immediate for a byte that names no opcode (trap 5). The dispatch
// loop then reads one packed entry per step instead of re-deriving these.
const IMM = new Int8Array(256).fill(-1);
const POPS = new Int8Array(256), PUSH = new Int8Array(256);
for (let op = 0; op < 256; op++) {
  const ok = op <= 7 || (op >= 0x10 && op <= 0x1e) || (op >= 0x20 && op <= 0x22) ||
    (op >= 0x30 && op <= 0x34) || op === 0x40 || op === 0x41 || (op >= 0x50 && op <= 0x53);
  if (!ok) continue;
  IMM[op] = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
  if (op === 1 || op === 2 || op === 0x52) PUSH[op] = 1;
  else if (op === 3 || op === 0x31 || op === 0x32 || op === 0x50 || op === 0x51 || op === 0x53) POPS[op] = 1;
  else if (op === 4) { POPS[op] = 1; PUSH[op] = 2; }
  else if (op === 0x17 || op === 0x1b || op === 0x40) { POPS[op] = 1; PUSH[op] = 1; }
  else if (op === 5) { POPS[op] = 2; PUSH[op] = 2; }
  else if (op === 6) { POPS[op] = 2; PUSH[op] = 3; }
  else if (op === 7) { POPS[op] = 3; PUSH[op] = 3; }
  else if (op === 0x41) POPS[op] = 2;
  else if (op >= 0x10 && op <= 0x22) { POPS[op] = 2; PUSH[op] = 1; }
}

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const buf = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, ip = 0, pc = 0, steps = 0;
  const n = p.length;
  const done = (code: number) => ({ out: buf.slice(0, olen), code });
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    const imm = IMM[op];
    if (imm < 0) return done(5);
    if (imm > 0 && pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < POPS[op]) return done(2);
    if (sp - POPS[op] + PUSH[op] > 256) return done(3);
    pc = next;
    switch (op) {
      case 0x00: return done(0);
      case 0x01: D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) return done(7);
        C[csp++] = next; pc = p[next - 2] | (p[next - 1] << 8); break;
      case 0x34:
        if (csp === 0) return done(8);
        pc = C[--csp]; break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return done(6);
        D[sp - 1] = M[a]; break;
      }
      case 0x41: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return done(6);
        M[a] = D[sp - 2]; sp -= 2; break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (olen + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) buf[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) return done(11);
        buf[olen++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return done(D[--sp] & 255);
      default: {
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return done(4); r = b === -1 ? 0 : a % b | 0; }
        else if (op === 0x15) { if (b === 0) return done(4); const u = a >>> 0, v = b >>> 0; r = ((u - u % v) / v) | 0; }
        else if (op === 0x16) { if (b === 0) return done(4); r = (a >>> 0) % (b >>> 0) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else if (op === 0x22) r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
      }
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
