# NanoTab wallets (2026-10-29 cleanup)

| Label | Address | Balance (Base 29 Oct) | Key location | Status |
|---|---|---|---|---|
| Buyer (live) | 0x49216Ec8708837FfbF20B53E7925A37EC53Fbd89 | ~0.81 USDC | /home/mint/.nanotab-buyer.key (600) + .bak.2026-10-16-init | ACTIVE - use for pay tests |
| Main (empty, archived) | 0x9f70c3baC733112d6091c38cD5AF231Db11085d5 | 0 | /home/mint/.nanotab-archive/nanotab-main-9f70.key | ARCHIVED |
| Frozen (lost key) | 0xFAe2860370581818bCbD42795997f105FeE954B0 | 12.11 USDC | NO KEY - lost Oct 16 init overwrite | FROZEN - $12.11 debt owed to Hector |
| Fee wallet | 0xc47b6d6a4137373ab169aeeedb95971d4939ef0b | 0 | protocol wallet (see worker env) | receive-only |
| Hector personal (receiving) | not on disk - Hector's own | n/a | Hector holds, never touch | SEPARATE - do not use for tests |

Rules: never overwrite key without --force + auto-backup (in CLI). One live buyer key only.
