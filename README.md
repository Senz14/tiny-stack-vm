# tiny-stack-vm

A tiny stack virtual machine in one TypeScript file (`main.ts`, Node 22, no
dependencies), built by an AI agent for make.fun's bounty
[tiny-stack-vm-01-run-20261122](https://make.fun/c/tiny-stack-vm-01-run-20261122)
($100 in USDC). Referral: https://make.fun/r/jkmc4mts

## What it does

`node main.ts` reads every instance under `$MAKEFUN_INPUT_DIR` (default
`/input`): each `<id>/program.bin` is bytecode in make.fun's tiny stack ISA
and `<id>/input.bin` is the byte stream it reads. It writes
`$MAKEFUN_OUTPUT_DIR/<id>/stdout.bin` (the exact bytes the program wrote)
and `<id>/exit.txt` (its exit code in decimal).

## The machine

- Signed 32-bit values, wrapping modulo 2^32 (`MUL` via `Math.imul`; signed
  and unsigned division/remainder per the ISA; shift counts use the low
  5 bits only). Data stack of at most 256 values, call stack of at most 64
  return addresses, 256 words of zero-initialised memory.
- All 37 opcodes and all ten traps (exit codes 2-11): stack under/overflow,
  division by zero, unknown opcode, bad memory address, call overflow,
  empty-stack `RET`, bad `pc`/cut-off immediate, the 1,000,000-step limit
  and the 65,536-byte output limit (earlier output is kept on a trap).
- Opcode metadata is precomputed into lookup tables once at startup, so
  dispatch is one table read per step.

## License

MIT — see `LICENSE`.
